/** 2問のHITL作成、本人確認、回答版、重複回答の排除を担当する。 */

function createHitl_(jobId, userId, questions) {
  if (!Array.isArray(questions) || questions.length !== 2) {
    throw new Error('サポート対象JOBのHITLはちょうど2問必要です。');
  }
  const hitlId = newId_('HITL');
  questions.forEach(function(question) {
    if (!question.reason || !question.impact || !question.recommended_option_id) {
      throw new Error('HITL質問にはreason、impact、recommended_option_idが必要です: ' + question.question_id);
    }
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 3) {
      throw new Error('HITL選択肢は2〜3件必要です: ' + question.question_id);
    }
    const optionIds = question.options.map(function(option) { return option.option_id; });
    if (optionIds.indexOf(question.recommended_option_id) === -1) {
      throw new Error('推奨選択肢がoptions内にありません: ' + question.question_id);
    }
    appendObject_('HITL', {
      HITL_ID: hitlId,
      JOB_ID: jobId,
      QUESTION_ID: question.question_id,
      QUESTION_TEXT: question.text,
      OPTIONS_JSON: json_({
        options: question.options,
        reason: question.reason,
        impact: question.impact,
        recommended_option_id: question.recommended_option_id
      }),
      STATUS: 'OPEN',
      ASSIGNED_USER_ID: userId,
      CREATED_AT: now_(),
      EXPIRES_AT: new Date('2026-08-26T08:00:00+09:00'),
      RESPONSE_JSON: '',
      RESPONSE_EVENT_ID: '',
      RESPONDED_AT: '',
      RESPONSE_VERSION: 0
    });
  });
  return hitlId;
}

function getHitlRows_(hitlId) {
  return readObjects_('HITL').filter(function(row) { return row.HITL_ID === hitlId; });
}

function submitHitlAnswers_(jobId, userId, responseVersion, answers) {
  const job = requireRunnableJob_(jobId);
  if (job.USER_ID !== userId) throw new Error('別ユーザーのJOBへ回答することはできません。');
  if (job.STATUS !== HIMAWARI.jobStatus.WAIT_HITL) throw new Error('このJOBはHITL回答待ちではありません。');
  const rows = getHitlRows_(job.CURRENT_HITL_ID);
  if (rows.length !== 2 || answers.length !== 2) throw new Error('2問すべての回答が必要です。');

  const byQuestion = {};
  answers.forEach(function(answer) { byQuestion[answer.question_id] = answer; });
  const results = [];
  rows.forEach(function(row) {
    const answer = byQuestion[row.QUESTION_ID];
    if (!answer) throw new Error('回答がありません: ' + row.QUESTION_ID);
    const optionContract = JSON.parse(row.OPTIONS_JSON);
    const allowed = optionContract.options.map(function(option) { return option.option_id; });
    if (allowed.indexOf(answer.option_id) === -1) throw new Error('許可されていない選択肢です: ' + answer.option_id);
    if (Number(row.RESPONSE_VERSION || 0) >= responseVersion) {
      results.push({created: false, question_id: row.QUESTION_ID});
      return;
    }
    const eventResult = recordEvent_(jobId, HIMAWARI.eventType.HITL_RESPONSE_RECEIVED, 'USER', userId, answer, row.QUESTION_ID, responseVersion);
    if (eventResult.created) {
      updateObjectRow_('HITL', row._row, {
        STATUS: 'ANSWERED',
        RESPONSE_JSON: json_(answer),
        RESPONSE_EVENT_ID: eventResult.event.EVENT_ID,
        RESPONDED_AT: now_(),
        RESPONSE_VERSION: responseVersion
      });
    }
    results.push({created: eventResult.created, question_id: row.QUESTION_ID});
  });
  return results;
}

function readHitlAnswers_(hitlId) {
  const rows = getHitlRows_(hitlId);
  if (rows.length !== 2 || rows.some(function(row) { return row.STATUS !== 'ANSWERED'; })) {
    throw new Error('2問の回答がそろっていません。');
  }
  const answers = {};
  rows.forEach(function(row) { answers[row.QUESTION_ID] = JSON.parse(row.RESPONSE_JSON).option_id; });
  return answers;
}
