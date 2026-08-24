/** SuperExcel Workerの構造化結果を検証し、同じJOBへ一度だけ反映する。 */

function tsugikore_phase2_worker_kekka_wo_uketsukeru(update) {
  return withJobLock_(function() {
    const normalized = phase2ValidateWorkerUpdate_(update);
    const job = requireRunnableJob_(normalized.job_id);
    const metadata = phase2JobMetadata_(job.JOB_ID);
    if (job.USER_ID !== normalized.user_id) throw new Error('Worker結果のUSER_IDが一致しません。');
    if (metadata.source_sha256 !== normalized.source_sha256) throw new Error('Worker結果の原本SHA-256が一致しません。');

    if (normalized.status === HIMAWARI.jobStatus.WAIT_HITL) {
      const waitEvent = recordEvent_(job.JOB_ID, HIMAWARI.eventType.WAIT_HITL_CREATED, 'WORKER', 'SuperExcel', normalized, 'ALL', normalized.update_version);
      if (!waitEvent.created) return {duplicate: true, job: getJob_(job.JOB_ID)};
      if (job.STATUS === HIMAWARI.jobStatus.QUEUED) patchJob_(job.JOB_ID, {STATUS: HIMAWARI.jobStatus.ACTIVE, NEXT_ACTION: 'VALIDATE_WORKER_RESULT'});
      const current = getJob_(job.JOB_ID);
      const hitlId = createHitl_(current.JOB_ID, current.USER_ID, normalized.pending_questions);
      patchJob_(current.JOB_ID, {
        STATUS: HIMAWARI.jobStatus.WAIT_HITL,
        PROGRESS: normalized.progress,
        NEXT_ACTION: 'WAIT_FOR_USER',
        CURRENT_HITL_ID: hitlId
      });
      return {duplicate: false, job: getJob_(job.JOB_ID), hitl_id: hitlId};
    }

    const completeEvent = recordEvent_(job.JOB_ID, HIMAWARI.eventType.JOB_COMPLETED, 'WORKER', 'SuperExcel', normalized, 'ALL', normalized.update_version);
    if (!completeEvent.created) return {duplicate: true, job: getJob_(job.JOB_ID)};
    if (job.STATUS === HIMAWARI.jobStatus.WAIT_HITL) patchJob_(job.JOB_ID, {STATUS: HIMAWARI.jobStatus.ACTIVE, NEXT_ACTION: 'FINALIZE'});
    const active = getJob_(job.JOB_ID);
    if (active.STATUS === HIMAWARI.jobStatus.QUEUED) patchJob_(job.JOB_ID, {STATUS: HIMAWARI.jobStatus.ACTIVE, NEXT_ACTION: 'FINALIZE'});
    patchJob_(job.JOB_ID, {
      STATUS: HIMAWARI.jobStatus.DONE,
      PROGRESS: 100,
      NEXT_ACTION: 'DELIVER',
      OUTPUT_REF: normalized.output.url
    });
    createDelivery_(job.JOB_ID, normalized.output.url, normalized.output.summary, completeEvent.event.EVENT_ID);
    enqueueMessage_(job.JOB_ID, 'COMPLETED', job.USER_ID, messageCompleted_(), [{
      type: 'OPEN_OUTPUT', output_ref: normalized.output.url
    }]);
    return {duplicate: false, job: getJob_(job.JOB_ID)};
  });
}

function phase2ValidateWorkerUpdate_(update) {
  if (!update || update.contract_version !== HIMAWARI_PHASE2.workerUpdateVersion) throw new Error('Worker結果の契約版が不正です。');
  ['job_id','user_id','source_sha256','status'].forEach(function(key) {
    if (!update[key]) throw new Error('Worker結果に' + key + 'がありません。');
  });
  const version = Number(update.update_version);
  if (!Number.isInteger(version) || version < 1) throw new Error('update_versionは1以上の整数が必要です。');
  const progress = Number(update.progress);
  if (!isFinite(progress) || progress < 0 || progress > 100) throw new Error('progressが範囲外です。');
  if ([HIMAWARI.jobStatus.WAIT_HITL, HIMAWARI.jobStatus.DONE].indexOf(update.status) === -1) {
    throw new Error('未対応のWorker状態です: ' + update.status);
  }
  if (update.status === HIMAWARI.jobStatus.WAIT_HITL) {
    if (!Array.isArray(update.pending_questions) || update.pending_questions.length !== 2) throw new Error('WAIT_HITLはちょうど2問必要です。');
    phase2ValidateQuestions_(update.pending_questions);
  }
  if (update.status === HIMAWARI.jobStatus.DONE) {
    if (progress !== 100 || !update.output) throw new Error('DONEは100%とoutputが必要です。');
    if (!/^https:\/\/(?:drive|docs)\.google\.com\//i.test(String(update.output.url || ''))) throw new Error('成果物はGoogle Drive URLが必要です。');
    if (!/^[a-f0-9]{64}$/i.test(String(update.output.sha256 || ''))) throw new Error('成果物SHA-256が必要です。');
    if (!update.output.qa || update.output.qa.passed !== true) throw new Error('成果物QAの合格記録が必要です。');
  }
  phase2AssertNoRawOrSecret_(update);
  return update;
}

function phase2ValidateQuestions_(questions) {
  const ids = {};
  questions.forEach(function(question) {
    if (!question.question_id || ids[question.question_id]) throw new Error('question_idが空または重複しています。');
    ids[question.question_id] = true;
    if (!question.text || !question.reason || !question.impact || !question.recommended_option_id) throw new Error('質問契約が不足しています: ' + question.question_id);
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 3) throw new Error('選択肢は2〜3件です。');
    const optionIds = {};
    question.options.forEach(function(option) {
      if (!option.option_id || !option.label || optionIds[option.option_id]) throw new Error('選択肢ID/表示名が空または重複しています。');
      optionIds[option.option_id] = true;
    });
    if (!optionIds[question.recommended_option_id]) throw new Error('推奨選択肢がoptions内にありません。');
  });
  return true;
}
