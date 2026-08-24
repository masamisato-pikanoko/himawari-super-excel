/** 実JOBの朝便、HITL回答回収、同一JOB再開要求を扱う。 */

function tsugikore_phase2_asa_no_houkoku_wo_tsukuru(jobId) {
  return withJobLock_(function() { return phase2BuildMorningForJob_(String(jobId)); });
}

function phase2BuildMorningForJob_(jobId) {
  const job = getJob_(jobId);
  if (!job) throw new Error('朝に回収するJOBがありません: ' + jobId);
  let messageType;
  let message;
  let promiseStatus;
  let actions = [];
  if (job.STATUS === HIMAWARI.jobStatus.WAIT_HITL) {
    messageType = 'MORNING_WAIT_HITL';
    message = messageMorningWaitHitl_(Number(job.PROGRESS));
    promiseStatus = 'WAIT_HITL';
    actions = getHitlRows_(job.CURRENT_HITL_ID).map(function(row) {
      return {question_id: row.QUESTION_ID, text: row.QUESTION_TEXT, contract: phase2SafeJsonParse_(row.OPTIONS_JSON, 'HITL options')};
    });
  } else if (job.STATUS === HIMAWARI.jobStatus.DONE) {
    messageType = 'MORNING_DONE';
    message = messageMorningDone_();
    promiseStatus = 'FULFILLED';
  } else if (job.STATUS === HIMAWARI.jobStatus.FAILED) {
    messageType = 'MORNING_FAILED';
    message = messageMorningFailed_();
    promiseStatus = 'FAILED';
  } else {
    throw new Error('朝便にできないJOB状態です: ' + job.STATUS);
  }
  const eventResult = recordEvent_(job.JOB_ID, HIMAWARI.eventType.MORNING_HANDOFF_CREATED, 'SYSTEM', 'ContinuityService', {
    job_status: job.STATUS, message_type: messageType
  });
  enqueueMessage_(job.JOB_ID, messageType, job.USER_ID, message, actions);
  if (job.CURRENT_PROMISE_ID) resolvePromise_(job.CURRENT_PROMISE_ID, promiseStatus, eventResult.event.EVENT_ID, '実JOBの翌朝OUTBOXへ回収');
  return {job_id: job.JOB_ID, message_type: messageType, outbox_only: true};
}

function tsugikore_phase2_HITL_kaitou_wo_hirou() {
  return withJobLock_(function() {
    const spreadsheet = SpreadsheetApp.openById(HIMAWARI.hitlSpreadsheetId);
    const queue = spreadsheet.getSheetByName('再開キュー');
    if (!queue) throw new Error('再開キューがありません。');
    if (queue.getLastRow() < 2) return {accepted: 0, skipped: 0};
    const rows = queue.getRange(2, 1, queue.getLastRow() - 1, 10).getValues();
    let accepted = 0;
    let skipped = 0;
    rows.forEach(function(row, index) {
      const sheetRow = index + 2;
      const jobId = String(row[1] || '');
      const status = String(row[3] || '').toLowerCase();
      if (!jobId || status !== 'pending') return;
      const job = getJob_(jobId);
      if (!job || job.STATUS !== HIMAWARI.jobStatus.WAIT_HITL) {
        skipped += 1;
        return;
      }
      const rawAnswers = phase2SafeJsonParse_(row[2], '再開キュー回答');
      const answers = rawAnswers.map(function(answer) {
        return {
          question_id: answer.question_id || answer.questionId,
          option_id: answer.option_id || answer.optionId,
          option_label: answer.option_label || answer.optionLabel || '',
          comment: answer.comment || ''
        };
      });
      queue.getRange(sheetRow, 5, 1, 2).setValues([[Number(row[4] || 0) + 1, new Date()]]);
      submitHitlAnswers_(job.JOB_ID, job.USER_ID, 1, answers);
      phase2RequestSameJobResume_(job.JOB_ID);
      queue.getRange(sheetRow, 4).setValue('accepted');
      queue.getRange(sheetRow, 7).setValue(new Date());
      accepted += 1;
    });
    return {accepted: accepted, skipped: skipped};
  });
}

function phase2RequestSameJobResume_(jobId) {
  const job = getJob_(jobId);
  if (!job || job.STATUS !== HIMAWARI.jobStatus.WAIT_HITL) throw new Error('同一JOB再開の対象状態ではありません。');
  const answers = readHitlAnswers_(job.CURRENT_HITL_ID);
  const event = recordEvent_(job.JOB_ID, HIMAWARI.eventType.WORKER_RESUMED, 'SYSTEM', 'ContinuityService', {
    same_job_id: job.JOB_ID,
    answers: answers,
    request_only: true
  }, 'ALL', 1);
  if (event.created) {
    patchJob_(job.JOB_ID, {NEXT_ACTION: 'RESUME_SUPER_EXCEL_WORKER'});
    enqueueMessage_(job.JOB_ID, 'HITL_ACKNOWLEDGED', job.USER_ID, messageAcknowledged_(), []);
  }
  return {created: event.created, job_id: job.JOB_ID, answers: answers};
}

function phase2SyntheticQuestions_(prefix) {
  return [1, 2].map(function(number) {
    const id = String(prefix || 'Q') + number;
    return {
      question_id: id,
      text: '確認事項' + number + 'をどちらにしますか？',
      reason: '業務判断が必要なためです。',
      impact: '対象行の仕上げに影響します。',
      options: [
        {option_id: id + '_REC', label: '推奨案'},
        {option_id: id + '_KEEP', label: '原状維持'}
      ],
      recommended_option_id: id + '_REC'
    };
  });
}
