/** GASgraph上でPhase 1の必須条件を検証し、最後に完成デモを残す。 */

function saigokore_runContinuityTests() {
  const results = [];
  function test_(name, callback) {
    callback();
    results.push({name: name, status: 'PASS'});
  }

  mazukore_setupDevGASgraph();
  withJobLock_(function() { resetDemoData_(); });

  test_('01 schemas have exact headers', function() {
    Object.keys(HIMAWARI.sheets).forEach(function(name) {
      const actual = sheet_(name).getRange(1, 1, 1, HIMAWARI.sheets[name].length).getDisplayValues()[0];
      assertEqual_(JSON.stringify(actual), JSON.stringify(HIMAWARI.sheets[name]), name + ' headers');
    });
  });

  tsugikore_receiveDemoExcel();
  tsugikore_createEveningHandoff();
  tsugikore_runOvernightWorker();
  tsugikore_buildMorningHandoff();

  test_('02 same JOB_ID survives overnight', function() {
    const ids = readObjects_('EVENTS').map(function(row) { return row.JOB_ID; });
    assertTrue_(ids.length > 0 && ids.every(function(id) { return id === HIMAWARI.demo.jobId; }), 'event JOB_ID continuity');
  });

  test_('03 WAIT_HITL has exactly two questions', function() {
    assertEqual_(getHitlRows_(getJob_(HIMAWARI.demo.jobId).CURRENT_HITL_ID).length, 2, 'HITL count');
  });

  tsugikore_submitDemoHitlAnswer();
  tsugikore_submitDemoHitlAnswer();
  tsugikore_resumeAndCompleteJob();
  tsugikore_resumeAndCompleteJob();
  tsugikore_createFeedbackPrompt();

  test_('04 duplicate HITL does not resume twice', function() {
    const resumed = readObjects_('EVENTS').filter(function(row) { return row.EVENT_TYPE === HIMAWARI.eventType.WORKER_RESUMED; });
    assertEqual_(resumed.length, 1, 'WORKER_RESUMED count');
  });

  test_('05 DONE is terminal', function() {
    const job = getJob_(HIMAWARI.demo.jobId);
    assertEqual_(job.STATUS, HIMAWARI.jobStatus.DONE, 'terminal status');
    assertEqual_(Number(job.PROGRESS), 100, 'terminal progress');
  });

  test_('06 morning promise is collected', function() {
    const promise = findObject_('PROMISES', function(row) { return row.JOB_ID === HIMAWARI.demo.jobId; });
    assertEqual_(promise.STATUS, 'WAIT_HITL', 'promise status');
    assertTrue_(Boolean(promise.FULFILLED_AT), 'promise fulfilled time');
  });

  test_('07 delivery remains linked to JOB', function() {
    const delivery = findObject_('DELIVERIES', function(row) { return row.JOB_ID === HIMAWARI.demo.jobId; });
    assertEqual_(delivery.OUTPUT_REF, HIMAWARI.demo.outputRef, 'delivery output ref');
  });

  test_('08 OUTBOX is chronological', function() {
    const times = readObjects_('OUTBOX').map(function(row) { return new Date(row.CREATED_AT).getTime(); });
    for (let i = 1; i < times.length; i += 1) assertTrue_(times[i] >= times[i - 1], 'OUTBOX chronology at ' + i);
  });

  test_('09 TEST_NOW crosses into next morning', function() {
    setTestNow_('2026-08-25T08:00:00+09:00');
    assertEqual_(Utilities.formatDate(now_(), HIMAWARI.timeZone, 'yyyy-MM-dd HH:mm'), '2026-08-25 08:00', 'test clock');
  });

  withJobLock_(function() { resetDemoData_(); });
  tsugikore_receiveDemoExcel();
  tsugikore_createEveningHandoff();
  runFailedWorkerForTest_();
  tsugikore_buildMorningHandoff();

  test_('10 failed promise also creates morning message', function() {
    const failedMessage = findObject_('OUTBOX', function(row) { return row.MESSAGE_TYPE === 'MORNING_FAILED'; });
    const promise = findObject_('PROMISES', function(row) { return row.JOB_ID === HIMAWARI.demo.jobId; });
    assertTrue_(Boolean(failedMessage), 'failure morning message');
    assertEqual_(promise.STATUS, 'FAILED', 'failed promise status');
  });

  const finalSnapshot = mazukore_runFullDemo();
  log_('INFO', HIMAWARI.demo.jobId, '', 'Continuity tests passed', {pass_count: results.length, results: results});
  return {pass_count: results.length, results: results, final_demo: finalSnapshot};
}

function assertEqual_(actual, expected, label) {
  if (actual !== expected) throw new Error(label + ': expected=' + expected + ', actual=' + actual);
}

function assertTrue_(condition, label) {
  if (!condition) throw new Error(label + ': expected true');
}
