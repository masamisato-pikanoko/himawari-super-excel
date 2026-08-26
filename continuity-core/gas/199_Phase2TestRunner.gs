/** Phase 2の境界条件をGASgraph上で検証し、最後はPhase 1デモ表示へ戻す。 */

function saigokore_phase2_no_test_wo_zenbu_yaru() {
  const results = [];
  function test_(name, callback) {
    callback();
    results.push({name: name, status: 'PASS'});
  }
  function throws_(callback, label) {
    let threw = false;
    try { callback(); } catch (error) { threw = true; }
    assertTrue_(threw, label);
  }

  mazukore_setupDevGASgraph();
  withJobLock_(function() { resetDemoData_(); });

  test_('01 next morning due date is dynamic', function() {
    const due = nextMorningAt_(new Date('2031-01-10T23:55:00+09:00'), 8);
    assertEqual_(formatTokyo_(due), '2031-01-11T08:00:00+09:00', 'dynamic due');
  });

  test_('02 envelope excludes raw bytes and secrets', function() {
    const envelope = phase2BuildWorkerEnvelope_(
      {JOB_ID:'T',USER_ID:'U',JOB_TYPE:'SUPER_EXCEL'},
      {source_file_id:'F',source_name:'a.xlsx',source_mime_type:HIMAWARI_PHASE2.excelMimeTypes[0],source_size_bytes:10,source_sha256:'a'.repeat(64),preserved_original_file_id:'P',job_folder_id:'J',artifacts_folder_id:'A'},
      {PROMISE_ID:'P1',DUE_AT:new Date('2031-01-11T08:00:00+09:00')}
    );
    assertTrue_(phase2AssertNoRawOrSecret_(envelope), 'safe envelope');
  });

  const synthetic = phase2CreateSyntheticJobForTest_('PH2_MAIN', 'USER_A');
  const waitUpdate = phase2WaitUpdateForTest_(synthetic, 1);
  tsugikore_phase2_worker_kekka_wo_uketsukeru(waitUpdate);

  test_('03 WAIT_HITL requires exactly two questions', function() {
    assertEqual_(getHitlRows_(getJob_(synthetic.jobId).CURRENT_HITL_ID).length, 2, 'HITL count');
    const invalid = JSON.parse(JSON.stringify(waitUpdate));
    invalid.pending_questions = invalid.pending_questions.slice(0, 1);
    throws_(function() { phase2ValidateWorkerUpdate_(invalid); }, 'one question rejected');
  });

  test_('04 one answer cannot resume', function() {
    const questions = phase2SyntheticQuestions_('M');
    throws_(function() {
      submitHitlAnswers_(synthetic.jobId, synthetic.userId, 1, [{question_id:questions[0].question_id,option_id:questions[0].recommended_option_id}]);
    }, 'partial response rejected');
  });

  test_('05 wrong user is rejected', function() {
    const questions = phase2SyntheticQuestions_('M');
    throws_(function() {
      submitHitlAnswers_(synthetic.jobId, 'OTHER_USER', 1, questions.map(function(q) { return {question_id:q.question_id,option_id:q.recommended_option_id}; }));
    }, 'wrong user rejected');
  });

  const mainQuestions = phase2SyntheticQuestions_('M');
  submitHitlAnswers_(synthetic.jobId, synthetic.userId, 1, mainQuestions.map(function(q) { return {question_id:q.question_id,option_id:q.recommended_option_id}; }));
  phase2RequestSameJobResume_(synthetic.jobId);
  phase2RequestSameJobResume_(synthetic.jobId);

  test_('06 two answers resume same job once', function() {
    const events = readObjects_('EVENTS').filter(function(row) { return row.JOB_ID === synthetic.jobId && row.EVENT_TYPE === HIMAWARI.eventType.WORKER_RESUMED; });
    assertEqual_(events.length, 1, 'resume event count');
    assertEqual_(getJob_(synthetic.jobId).NEXT_ACTION, 'RESUME_SUPER_EXCEL_WORKER', 'same job resume');
  });

  test_('07 duplicate worker update is idempotent', function() {
    const duplicate = tsugikore_phase2_worker_kekka_wo_uketsukeru(waitUpdate);
    assertTrue_(duplicate.duplicate, 'duplicate update');
  });

  phase2BuildMorningForJob_(synthetic.jobId);
  test_('08 exit mapping preserves exactly two questions', function() {
    const message = findObject_('OUTBOX', function(row) { return row.JOB_ID === synthetic.jobId && row.MESSAGE_TYPE === 'MORNING_WAIT_HITL'; });
    const payload = phase2ExitPayloadForMessage_(message);
    assertEqual_(payload.questions.length, 2, 'exit question count');
    assertEqual_(payload.action, 'deliver_morning', 'exit action');
  });

  test_('09 DONE requires Drive URL hash and QA', function() {
    const invalidDone = phase2DoneUpdateForTest_(synthetic, 2);
    invalidDone.output.qa.passed = false;
    throws_(function() { phase2ValidateWorkerUpdate_(invalidDone); }, 'QA required');
  });

  const done = phase2DoneUpdateForTest_(synthetic, 2);
  tsugikore_phase2_worker_kekka_wo_uketsukeru(done);
  test_('10 completion retains same JOB and evidence', function() {
    const job = getJob_(synthetic.jobId);
    assertEqual_(job.STATUS, HIMAWARI.jobStatus.DONE, 'done status');
    assertEqual_(job.OUTPUT_REF, done.output.url, 'output URL');
  });

  test_('11 five jobs remain separated', function() {
    const ids = [];
    for (let i = 1; i <= 5; i += 1) ids.push(phase2CreateSyntheticJobForTest_('PH2_FIVE_' + i, 'USER_' + i).jobId);
    assertEqual_(new Set(ids).size, 5, 'five unique IDs');
    ids.forEach(function(id) { assertEqual_(getJob_(id).JOB_ID, id, 'job identity'); });
  });

  test_('12 exit bridge blocks safely without config', function() {
    const properties = PropertiesService.getScriptProperties();
    const url = properties.getProperty(HIMAWARI_PHASE2.properties.exitUrl);
    const secret = properties.getProperty(HIMAWARI_PHASE2.properties.exitSecret);
    if (!url || !secret) {
      const result = saigokore_phase2_OUTBOX_wo_dekiguchi_ni_okuru();
      assertTrue_(result.blocked, 'safe block');
    }
  });

  const finalSnapshot = mazukore_runFullDemo();
  log_('INFO', HIMAWARI.demo.jobId, '', 'Phase 2 tests passed', {pass_count: results.length, results: results});
  return {pass_count: results.length, results: results, final_demo: finalSnapshot, real_chat_messages_sent: 0};
}

function phase2CreateSyntheticJobForTest_(jobId, userId) {
  const sha = phase2Sha256Hex_(Utilities.newBlob(jobId).getBytes());
  createJob_({JOB_ID:jobId,USER_ID:userId,JOB_TYPE:'SUPER_EXCEL',SOURCE_NAME:jobId + '.xlsx'});
  recordEvent_(jobId, HIMAWARI.eventType.JOB_RECEIVED, 'TEST', userId, {
    source_file_id:'FILE_' + jobId,source_name:jobId + '.xlsx',source_url:'https://drive.google.com/file/d/FILE_' + jobId,
    source_mime_type:HIMAWARI_PHASE2.excelMimeTypes[0],source_size_bytes:100,source_sha256:sha,
    preserved_original_file_id:'COPY_' + jobId,preserved_original_url:'https://drive.google.com/file/d/COPY_' + jobId,
    job_folder_id:'FOLDER_' + jobId,job_folder_url:'https://drive.google.com/drive/folders/FOLDER_' + jobId,
    artifacts_folder_id:'ART_' + jobId,source_was_not_modified:true,test_only:true
  });
  const promise = createPromise_(jobId, userId);
  patchJob_(jobId,{STATUS:HIMAWARI.jobStatus.QUEUED,NEXT_ACTION:'RUN_SUPER_EXCEL_WORKER',CURRENT_PROMISE_ID:promise.PROMISE_ID});
  return {jobId:jobId,userId:userId,sha256:sha};
}

function phase2WaitUpdateForTest_(synthetic, version) {
  return {
    contract_version:HIMAWARI_PHASE2.workerUpdateVersion,update_version:version,
    job_id:synthetic.jobId,user_id:synthetic.userId,source_sha256:synthetic.sha256,
    status:HIMAWARI.jobStatus.WAIT_HITL,progress:82,pending_questions:phase2SyntheticQuestions_('M')
  };
}

function phase2DoneUpdateForTest_(synthetic, version) {
  return {
    contract_version:HIMAWARI_PHASE2.workerUpdateVersion,update_version:version,
    job_id:synthetic.jobId,user_id:synthetic.userId,source_sha256:synthetic.sha256,
    status:HIMAWARI.jobStatus.DONE,progress:100,pending_questions:[],
    output:{url:'https://drive.google.com/file/d/OUTPUT_' + synthetic.jobId,sha256:'b'.repeat(64),summary:'2問の回答を反映した改訂版',qa:{passed:true,formula_errors:0,original_sha256:synthetic.sha256}}
  };
}
