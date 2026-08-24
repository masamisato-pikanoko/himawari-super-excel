/** まさみが棚札順に押せるContinuity Coreのデモ入口を提供する。 */

function tsugikore_receiveDemoExcel() {
  return withJobLock_(function() {
    setTestNow_('2026-08-24T17:30:00+09:00');
    const created = createJob_({
      JOB_ID: HIMAWARI.demo.jobId,
      USER_ID: HIMAWARI.demo.userId,
      JOB_TYPE: HIMAWARI.demo.jobType,
      SOURCE_NAME: HIMAWARI.demo.sourceName
    });
    const eventResult = recordEvent_(HIMAWARI.demo.jobId, HIMAWARI.eventType.JOB_RECEIVED, 'USER', HIMAWARI.demo.userId, {source_name: HIMAWARI.demo.sourceName});
    enqueueMessage_(HIMAWARI.demo.jobId, 'RECEIVED', HIMAWARI.demo.userId, messageReceived_(), []);
    log_('INFO', HIMAWARI.demo.jobId, eventResult.event.EVENT_ID, 'Demo Excel received', {created: created.created});
    return getJob_(HIMAWARI.demo.jobId);
  });
}

function tsugikore_createEveningHandoff() {
  return withJobLock_(function() {
    setTestNow_('2026-08-24T18:00:00+09:00');
    const job = requireRunnableJob_(HIMAWARI.demo.jobId);
    const promise = createPromise_(job.JOB_ID, job.USER_ID);
    const promiseEvent = recordEvent_(job.JOB_ID, HIMAWARI.eventType.PROMISE_CREATED, 'SYSTEM', 'ContinuityService', {promise_id: promise.PROMISE_ID, due_at: formatTokyo_(promise.DUE_AT)});
    if (promiseEvent.created) {
      patchJob_(job.JOB_ID, {STATUS: HIMAWARI.jobStatus.QUEUED, NEXT_ACTION: 'RUN_OVERNIGHT_WORKER', CURRENT_PROMISE_ID: promise.PROMISE_ID});
    }
    recordEvent_(job.JOB_ID, HIMAWARI.eventType.NIGHT_HANDOFF, 'SYSTEM', 'ContinuityService', {promise_id: promise.PROMISE_ID});
    enqueueMessage_(job.JOB_ID, 'NIGHT_HANDOFF', job.USER_ID, messageEvening_(), []);
    return promise;
  });
}

function tsugikore_runOvernightWorker() {
  return withJobLock_(function() {
    setTestNow_('2026-08-25T06:18:00+09:00');
    const job = requireRunnableJob_(HIMAWARI.demo.jobId);
    const startEvent = recordEvent_(job.JOB_ID, HIMAWARI.eventType.WORKER_STARTED, 'WORKER', 'DemoExcelWorker', {worker: 'demo'});
    if (startEvent.created) patchJob_(job.JOB_ID, {STATUS: HIMAWARI.jobStatus.ACTIVE, NEXT_ACTION: 'PROCESS'});
    const update = demoWorkerWaitHitl_();
    const waitEvent = recordEvent_(job.JOB_ID, HIMAWARI.eventType.WAIT_HITL_CREATED, 'WORKER', 'DemoExcelWorker', update);
    if (waitEvent.created) {
      const hitlId = createHitl_(job.JOB_ID, job.USER_ID, update.pending_questions);
      patchJob_(job.JOB_ID, {STATUS: HIMAWARI.jobStatus.WAIT_HITL, PROGRESS: update.progress, NEXT_ACTION: update.next_action, CURRENT_HITL_ID: hitlId});
    }
    return update;
  });
}

function tsugikore_buildMorningHandoff() {
  return withJobLock_(function() {
    setTestNow_('2026-08-25T08:00:00+09:00');
    const job = getJob_(HIMAWARI.demo.jobId);
    if (!job) throw new Error('朝に回収するJOBがありません。');
    let message;
    let type;
    let promiseStatus;
    let actions = [];
    if (job.STATUS === HIMAWARI.jobStatus.WAIT_HITL) {
      message = messageMorningWaitHitl_(Number(job.PROGRESS));
      type = 'MORNING_WAIT_HITL';
      promiseStatus = 'WAIT_HITL';
      actions = getHitlRows_(job.CURRENT_HITL_ID).map(function(row) {
        return {question_id: row.QUESTION_ID, text: row.QUESTION_TEXT, contract: JSON.parse(row.OPTIONS_JSON)};
      });
    } else if (job.STATUS === HIMAWARI.jobStatus.DONE) {
      message = messageMorningDone_();
      type = 'MORNING_DONE';
      promiseStatus = 'FULFILLED';
    } else if (job.STATUS === HIMAWARI.jobStatus.FAILED) {
      message = messageMorningFailed_();
      type = 'MORNING_FAILED';
      promiseStatus = 'FAILED';
    } else {
      throw new Error('朝便にできないJOB状態です: ' + job.STATUS);
    }
    const eventResult = recordEvent_(job.JOB_ID, HIMAWARI.eventType.MORNING_HANDOFF_CREATED, 'SYSTEM', 'ContinuityService', {job_status: job.STATUS, message_type: type});
    enqueueMessage_(job.JOB_ID, type, job.USER_ID, message, actions);
    resolvePromise_(job.CURRENT_PROMISE_ID, promiseStatus, eventResult.event.EVENT_ID, '翌朝のOUTBOXへ回収');
    return {job: job, message_type: type};
  });
}

function tsugikore_submitDemoHitlAnswer() {
  return withJobLock_(function() {
    setTestNow_('2026-08-25T08:05:00+09:00');
    const job = getJob_(HIMAWARI.demo.jobId);
    if (job && (job.STATUS === HIMAWARI.jobStatus.DONE || job.STATUS === HIMAWARI.jobStatus.CLOSED)) {
      return {duplicate: true, reason: 'JOB_TERMINAL'};
    }
    const answers = [
      {question_id: 'Q1', option_id: 'Q1_NEWEST', option_label: '更新日の新しい方', comment: ''},
      {question_id: 'Q2', option_id: 'Q2_REVIEW', option_label: '該当行を確認対象にする', comment: ''}
    ];
    const results = submitHitlAnswers_(HIMAWARI.demo.jobId, HIMAWARI.demo.userId, 1, answers);
    if (results.some(function(result) { return result.created; })) {
      enqueueMessage_(HIMAWARI.demo.jobId, 'HITL_ACKNOWLEDGED', HIMAWARI.demo.userId, messageAcknowledged_(), []);
      patchJob_(HIMAWARI.demo.jobId, {NEXT_ACTION: 'RESUME_WORKER'});
    }
    return {duplicate: results.every(function(result) { return !result.created; }), results: results};
  });
}

function tsugikore_resumeAndCompleteJob() {
  return withJobLock_(function() {
    setTestNow_('2026-08-25T09:12:00+09:00');
    const existing = getJob_(HIMAWARI.demo.jobId);
    if (!existing) throw new Error('再開するJOBがありません。');
    if (existing.STATUS === HIMAWARI.jobStatus.DONE || existing.STATUS === HIMAWARI.jobStatus.CLOSED) {
      return {duplicate: true, job: existing};
    }
    const answers = readHitlAnswers_(existing.CURRENT_HITL_ID);
    const resumeEvent = recordEvent_(existing.JOB_ID, HIMAWARI.eventType.WORKER_RESUMED, 'WORKER', 'DemoExcelWorker', {answers: answers}, 'ALL', 1);
    if (!resumeEvent.created) return {duplicate: true, job: getJob_(existing.JOB_ID)};
    patchJob_(existing.JOB_ID, {STATUS: HIMAWARI.jobStatus.ACTIVE, NEXT_ACTION: 'COMPLETE'});
    const update = demoWorkerDone_(answers);
    const completeEvent = recordEvent_(existing.JOB_ID, HIMAWARI.eventType.JOB_COMPLETED, 'WORKER', 'DemoExcelWorker', update);
    if (completeEvent.created) {
      patchJob_(existing.JOB_ID, {STATUS: HIMAWARI.jobStatus.DONE, PROGRESS: 100, NEXT_ACTION: 'DELIVER', OUTPUT_REF: update.output_refs[0]});
    }
    const deliveryEvent = recordEvent_(existing.JOB_ID, HIMAWARI.eventType.DELIVERY_CREATED, 'SYSTEM', 'ContinuityService', {output_ref: update.output_refs[0]});
    createDelivery_(existing.JOB_ID, update.output_refs[0], 'HITL回答を反映したダミー改訂版', deliveryEvent.event.EVENT_ID);
    enqueueMessage_(existing.JOB_ID, 'COMPLETED', existing.USER_ID, messageCompleted_(), [{type: 'OPEN_OUTPUT', output_ref: update.output_refs[0]}]);
    return {duplicate: false, job: getJob_(existing.JOB_ID)};
  });
}

function tsugikore_createFeedbackPrompt() {
  return withJobLock_(function() {
    setTestNow_('2026-08-25T09:13:00+09:00');
    const job = getJob_(HIMAWARI.demo.jobId);
    if (!job || job.STATUS !== HIMAWARI.jobStatus.DONE) throw new Error('完了済みJOBだけが訂正記録の確認へ進めます。');
    const eventResult = recordEvent_(job.JOB_ID, HIMAWARI.eventType.FEEDBACK_PROMPT_CREATED, 'SYSTEM', 'ContinuityService', {consent_required: true});
    enqueueMessage_(job.JOB_ID, 'FEEDBACK_PROMPT', job.USER_ID, messageFeedback_(), [{option_id: 'ALLOW_THIS_JOB', label: '今回だけ記録'}, {option_id: 'DO_NOT_STORE', label: '記録しない'}]);
    return eventResult;
  });
}

function mazukore_runFullDemo() {
  mazukore_setupDevGASgraph();
  withJobLock_(function() { resetDemoData_(); });
  tsugikore_receiveDemoExcel();
  tsugikore_createEveningHandoff();
  tsugikore_runOvernightWorker();
  tsugikore_buildMorningHandoff();
  tsugikore_submitDemoHitlAnswer();
  tsugikore_resumeAndCompleteJob();
  tsugikore_createFeedbackPrompt();
  return fullDemoSnapshot_();
}

function fullDemoSnapshot_() {
  const job = getJob_(HIMAWARI.demo.jobId);
  return {
    job: job,
    event_count: readObjects_('EVENTS').filter(function(row) { return row.JOB_ID === HIMAWARI.demo.jobId; }).length,
    promise_count: readObjects_('PROMISES').filter(function(row) { return row.JOB_ID === HIMAWARI.demo.jobId; }).length,
    hitl_count: readObjects_('HITL').filter(function(row) { return row.JOB_ID === HIMAWARI.demo.jobId; }).length,
    delivery_count: readObjects_('DELIVERIES').filter(function(row) { return row.JOB_ID === HIMAWARI.demo.jobId; }).length,
    outbox_count: readObjects_('OUTBOX').filter(function(row) { return row.JOB_ID === HIMAWARI.demo.jobId; }).length
  };
}

function runFailedWorkerForTest_() {
  return withJobLock_(function() {
    setTestNow_('2026-08-25T05:40:00+09:00');
    const job = requireRunnableJob_(HIMAWARI.demo.jobId);
    const started = recordEvent_(job.JOB_ID, HIMAWARI.eventType.WORKER_STARTED, 'WORKER', 'DemoExcelWorker', {worker: 'demo_failure'});
    if (started.created) patchJob_(job.JOB_ID, {STATUS: HIMAWARI.jobStatus.ACTIVE});
    const failed = recordEvent_(job.JOB_ID, HIMAWARI.eventType.WORKER_FAILED, 'WORKER', 'DemoExcelWorker', {error_code: 'DEMO_FAILURE'});
    if (failed.created) patchJob_(job.JOB_ID, {STATUS: HIMAWARI.jobStatus.FAILED, NEXT_ACTION: 'MORNING_FAILURE_REPORT'});
    return failed;
  });
}
