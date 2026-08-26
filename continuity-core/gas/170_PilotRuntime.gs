/** まさみ専用のDrive投入箱、Windows Worker連携、停止スイッチをまとめる。 */

const HIMAWARI_PILOT = Object.freeze({
  folderName: 'まさみ試運転',
  userId: 'MASAMI_PILOT',
  workerControlFile: 'pilot-control.json',
  maxCasesPerScan: 20,
  exitUrl: 'https://script.google.com/macros/s/AKfycbz0iNwHZJJDh0idqzdTaV5zb-gdUYGdYLYvBOapt7IEG9nWy0rkubl4ApQ6e_pZfLQ6/exec',
  exitKeyId: 'continuity-v2'
});

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🌻試運転')
    .addItem('① 試運転の準備', 'mazukore_shiunten_no_junbi_wo_suru')
    .addItem('② 今すぐ一周動かす', 'tsugikore_shiunten_wo_ima_ugokasu')
    .addItem('③ 試運転を開始', 'mazukore_shiunten_wo_hajimeru')
    .addSeparator()
    .addItem('いまの状態を見る', 'saigokore_ima_no_joutai_wo_miru')
    .addItem('困ったら停止', 'komattara_shiunten_wo_tomeru')
    .addToUi();
}

function mazukore_shiunten_no_junbi_wo_suru() {
  assertDevSpreadsheet_();
  const base = mazukore_phase2_dev_uketsuke_wo_tsukuru();
  const inbox = DriveApp.getFolderById(phase2Property_(HIMAWARI_PHASE2.properties.inboxFolderId));
  const pilot = phase2GetOrCreateChildFolder_(inbox, HIMAWARI_PILOT.folderName);
  phase2SetNonSecretProperty_(HIMAWARI_PHASE2.properties.pilotFolderId, pilot.getId(), 'まさみ専用の試運転投入箱');
  phase2SetNonSecretProperty_(HIMAWARI_PHASE2.properties.pilotUserId, HIMAWARI_PILOT.userId, '試運転の固定USER_ID');
  phase2SetNonSecretProperty_(HIMAWARI_PHASE2.properties.pilotImmediate, 'TRUE', '試運転中は2問を準備でき次第送る');
  phase2SetNonSecretProperty_(HIMAWARI_PHASE2.properties.pilotEnabled, 'FALSE', '開始棚札を押すまで停止');
  phase2PilotWriteControl_(false);
  const result = {
    ready: true,
    pilot_enabled: false,
    pilot_folder_url: pilot.getUrl(),
    jobs_folder_url: base.jobs_folder_url,
    instruction: 'まさみ試運転の中へ、1案件1フォルダでExcelと画像を入れてください。'
  };
  phase2PilotToast_('試運転の投入箱を準備しました。まだ自動運転は停止中です。');
  return result;
}

function mazukore_dekiguchi_no_koukai_settei_wo_ireru() {
  assertDevSpreadsheet_();
  phase2SetNonSecretProperty_(HIMAWARI_PHASE2.properties.exitUrl, HIMAWARI_PILOT.exitUrl, '出口API v14の固定URL');
  phase2SetNonSecretProperty_(HIMAWARI_PHASE2.properties.exitKeyId, HIMAWARI_PILOT.exitKeyId, '継続処理専用の鍵ID');
  phase2PilotToast_('出口URLと鍵IDを設定しました。秘密値は変更していません。');
  return {configured:true,exit_url:HIMAWARI_PILOT.exitUrl,key_id:HIMAWARI_PILOT.exitKeyId,secret_changed:false};
}

function mazukore_shiunten_wo_hajimeru() {
  assertDevSpreadsheet_();
  if (getConfig_('TEST_NOW')) throw new Error('CONFIG.TEST_NOWを空欄にしてから試運転を開始してください。');
  const required = [
    HIMAWARI_PHASE2.properties.pilotFolderId,
    HIMAWARI_PHASE2.properties.jobsFolderId,
    HIMAWARI_PHASE2.properties.exitUrl,
    HIMAWARI_PHASE2.properties.exitSecret
  ];
  const missing = required.filter(function(name) { return !phase2Property_(name); });
  if (missing.length) throw new Error('試運転の開始条件が不足しています: ' + missing.join(', '));
  phase2SetNonSecretProperty_(HIMAWARI_PHASE2.properties.pilotEnabled, 'TRUE', 'まさみ専用試運転を有効化');
  phase2PilotWriteControl_(true);
  let trigger;
  try {
    trigger = saigokore_phase2_10pun_torigaa_wo_tsukuru();
  } catch (error) {
    phase2SetNonSecretProperty_(HIMAWARI_PHASE2.properties.pilotEnabled, 'FALSE', '開始失敗のため安全停止');
    phase2PilotWriteControl_(false);
    throw error;
  }
  phase2PilotToast_('🌻試運転を開始しました。投入箱を10分ごとに確認します。');
  return {pilot_enabled:true,trigger:trigger,chat_send_enabled:true};
}

function komattara_shiunten_wo_tomeru() {
  assertDevSpreadsheet_();
  phase2SetNonSecretProperty_(HIMAWARI_PHASE2.properties.pilotEnabled, 'FALSE', '人間の停止棚札で停止');
  phase2PilotWriteControl_(false);
  phase2PilotToast_('🌻試運転を停止しました。原本と途中成果はそのまま保全しています。');
  return {pilot_enabled:false,artifacts_preserved:true,triggers_deleted:false};
}

function tsugikore_shiunten_wo_ima_ugokasu() {
  assertDevSpreadsheet_();
  const intake = tsugikore_shiire_bako_wo_kakunin();
  const workerBefore = tsugikore_windows_worker_no_kekka_wo_hirou();
  const resume = tsugikore_phase2_HITL_kaitou_wo_hirou();
  const workerAfter = tsugikore_windows_worker_no_kekka_wo_hirou();
  const delivery = saigokore_phase2_OUTBOX_wo_dekiguchi_ni_okuru();
  phase2PilotToast_('🌻試運転を一周確認しました。');
  return {intake:intake,worker_before:workerBefore,resume:resume,worker_after:workerAfter,delivery:delivery};
}

function tsugikore_shiire_bako_wo_kakunin() {
  if (phase2Property_(HIMAWARI_PHASE2.properties.pilotEnabled) !== 'TRUE') return {enabled:false,created:0,existing:0,errors:0};
  const pilotId = phase2Property_(HIMAWARI_PHASE2.properties.pilotFolderId);
  if (!pilotId) throw new Error('先に mazukore_shiunten_no_junbi_wo_suru を実行してください。');
  const pilot = DriveApp.getFolderById(pilotId);
  const cases = [pilot];
  const folders = pilot.getFolders();
  while (folders.hasNext() && cases.length <= HIMAWARI_PILOT.maxCasesPerScan) cases.push(folders.next());
  let created = 0;
  let existing = 0;
  let errors = 0;
  const results = [];
  cases.slice(0, HIMAWARI_PILOT.maxCasesPerScan).forEach(function(folder) {
    try {
      const content = phase2PilotCaseContent_(folder);
      if (!content.excel.length) return;
      if (content.excel.length !== 1) throw new Error('1案件フォルダのExcelは1件だけにしてください: ' + folder.getName());
      const result = mazukore_phase2_file_wo_uketsukeru(
        content.excel[0].getId(),
        phase2Property_(HIMAWARI_PHASE2.properties.pilotUserId) || HIMAWARI_PILOT.userId,
        content.images.map(function(file) { return file.getId(); }),
        folder.getId()
      );
      if (result.created) created += 1; else existing += 1;
      results.push({case_name:folder.getName(),job_id:result.job_id,created:result.created,attachment_count:content.images.length});
    } catch (error) {
      errors += 1;
      log_('ERROR', '', '', 'Pilot intake stopped safely', {case_name:folder.getName(),message:String(error.message || error).slice(0,500)});
    }
  });
  return {enabled:true,created:created,existing:existing,errors:errors,results:results};
}

function phase2PilotCaseContent_(folder) {
  const excel = [];
  const images = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const mime = file.getMimeType();
    if (HIMAWARI_PHASE2.excelMimeTypes.indexOf(mime) !== -1) excel.push(file);
    else if (/^image\//i.test(mime)) images.push(file);
  }
  return {excel:excel,images:images};
}

function tsugikore_windows_worker_no_kekka_wo_hirou() {
  if (phase2Property_(HIMAWARI_PHASE2.properties.pilotEnabled) !== 'TRUE') return {enabled:false,wait_hitl:0,done:0,failed:0};
  const jobs = readObjects_('JOBS').filter(function(job) {
    return job.USER_ID === (phase2Property_(HIMAWARI_PHASE2.properties.pilotUserId) || HIMAWARI_PILOT.userId)
      && job.STATUS !== HIMAWARI.jobStatus.DONE && job.STATUS !== HIMAWARI.jobStatus.CLOSED;
  });
  let waitHitl = 0;
  let done = 0;
  let failed = 0;
  const results = [];
  jobs.forEach(function(job) {
    try {
      const metadata = phase2JobMetadata_(job.JOB_ID);
      const artifacts = DriveApp.getFolderById(metadata.artifacts_folder_id);
      const failedUpdate = phase2PilotReadArtifactIfAny_(artifacts, 'worker-update.failed.v1.json');
      const doneUpdate = phase2PilotReadArtifactIfAny_(artifacts, 'worker-update.done.v2.json');
      const waitUpdate = phase2PilotReadArtifactIfAny_(artifacts, 'worker-update.wait.v1.json');
      if (failedUpdate) {
        const outcome = phase2PilotIngestFailure_(job, failedUpdate);
        if (outcome.created) failed += 1;
        results.push({job_id:job.JOB_ID,status:'FAILED',created:outcome.created});
        return;
      }
      if (doneUpdate) {
        const normalizedDone = phase2PilotNormalizeDone_(job, metadata, doneUpdate);
        if (!normalizedDone) return;
        const outcome = tsugikore_phase2_worker_kekka_wo_uketsukeru(normalizedDone);
        if (!outcome.duplicate) done += 1;
        results.push({job_id:job.JOB_ID,status:'DONE',created:!outcome.duplicate});
        return;
      }
      if (waitUpdate && [HIMAWARI.jobStatus.QUEUED,HIMAWARI.jobStatus.ACTIVE].indexOf(job.STATUS) !== -1) {
        const outcome = tsugikore_phase2_worker_kekka_wo_uketsukeru(waitUpdate);
        if (!outcome.duplicate) {
          waitHitl += 1;
          if (phase2Property_(HIMAWARI_PHASE2.properties.pilotImmediate) === 'TRUE') phase2BuildMorningForJob_(job.JOB_ID);
        }
        results.push({job_id:job.JOB_ID,status:'WAIT_HITL',created:!outcome.duplicate});
      }
    } catch (error) {
      log_('ERROR', job.JOB_ID, '', 'Pilot Worker result intake stopped safely', {message:String(error.message || error).slice(0,500)});
      results.push({job_id:job.JOB_ID,status:'ERROR',message:String(error.message || error).slice(0,300)});
    }
  });
  return {enabled:true,wait_hitl:waitHitl,done:done,failed:failed,results:results};
}

function phase2PilotReadArtifactIfAny_(folder, name) {
  const files = folder.getFilesByName(name);
  if (!files.hasNext()) return null;
  const file = files.next();
  if (files.hasNext()) throw new Error('Worker成果JSONが重複しています: ' + name);
  return phase2SafeJsonParse_(file.getBlob().getDataAsString('UTF-8'), name);
}

function phase2PilotNormalizeDone_(job, metadata, update) {
  if (update.job_id !== job.JOB_ID || !update.output) throw new Error('完成Worker結果のJOBまたはoutputが不正です。');
  const relative = String(update.output.relative_path || '');
  if (!/^final\/[^\/\\]+\.xlsx$/i.test(relative)) {
    throw new Error('完成Excelの相対パスが不正です。');
  }
  const parts = relative.split('/');
  const jobFolder = DriveApp.getFolderById(metadata.job_folder_id);
  const finalFolders = jobFolder.getFoldersByName(parts[0]);
  if (!finalFolders.hasNext()) return null;
  const finalFolder = finalFolders.next();
  const files = finalFolder.getFilesByName(parts[1]);
  if (!files.hasNext()) return null;
  const outputFile = files.next();
  if (files.hasNext()) throw new Error('完成Excelが重複しています: ' + parts[1]);
  const driveHash = phase2Sha256Hex_(outputFile.getBlob().getBytes());
  if (driveHash !== update.output.sha256) throw new Error('Drive上の完成Excel SHA-256がWorker検品と一致しません。');
  update.output.url = outputFile.getUrl();
  update.output.file_id = outputFile.getId();
  return update;
}

function phase2PilotIngestFailure_(job, update) {
  if (update.contract_version !== HIMAWARI_PHASE2.workerUpdateVersion || update.job_id !== job.JOB_ID || update.user_id !== job.USER_ID || update.status !== 'FAILED') throw new Error('失敗Worker結果の契約・JOB・USERが不正です。');
  const metadata = phase2JobMetadata_(job.JOB_ID);
  if (metadata.source_sha256 !== update.source_sha256) throw new Error('失敗Worker結果の原本SHA-256が一致しません。');
  const event = recordEvent_(job.JOB_ID, HIMAWARI.eventType.WORKER_FAILED, 'WORKER', 'SuperExcel', {
    contract_version:update.contract_version,
    error:update.error || {code:'WORKER_FAILED',message:'安全停止'}
  }, 'ALL', Number(update.update_version || 1));
  if (!event.created) return {created:false};
  let current = getJob_(job.JOB_ID);
  if (current.STATUS === HIMAWARI.jobStatus.QUEUED) current = patchJob_(job.JOB_ID, {STATUS:HIMAWARI.jobStatus.ACTIVE,NEXT_ACTION:'SAFE_STOP'});
  patchJob_(job.JOB_ID, {STATUS:HIMAWARI.jobStatus.FAILED,PROGRESS:0,NEXT_ACTION:'HUMAN_REVIEW',NOTE:String(update.error && update.error.code || 'WORKER_FAILED')});
  enqueueMessage_(job.JOB_ID, 'FAILED', job.USER_ID, messageMorningFailed_(), []);
  return {created:true};
}

function phase2PilotWriteControl_(enabled) {
  const rootId = phase2Property_(HIMAWARI_PHASE2.properties.rootFolderId);
  if (!rootId) throw new Error('Phase 2 DEV rootが未設定です。');
  const root = DriveApp.getFolderById(rootId);
  const runtime = phase2GetOrCreateChildFolder_(root, 'worker-runtime');
  const payload = JSON.stringify({enabled:enabled === true,updated_at:new Date().toISOString(),source:'Continuity Core'}, null, 2);
  const files = runtime.getFilesByName(HIMAWARI_PILOT.workerControlFile);
  const file = files.hasNext() ? files.next() : runtime.createFile(HIMAWARI_PILOT.workerControlFile, payload, MimeType.PLAIN_TEXT);
  if (file.getBlob().getDataAsString('UTF-8') !== payload) file.setContent(payload);
  return file.getUrl();
}

function saigokore_ima_no_joutai_wo_miru() {
  assertDevSpreadsheet_();
  const pilotUser = phase2Property_(HIMAWARI_PHASE2.properties.pilotUserId) || HIMAWARI_PILOT.userId;
  const jobs = readObjects_('JOBS').filter(function(job) { return job.USER_ID === pilotUser; });
  const counts = {};
  jobs.forEach(function(job) { counts[job.STATUS] = Number(counts[job.STATUS] || 0) + 1; });
  const pending = readObjects_('OUTBOX').filter(function(row) { return row.STATUS === 'PENDING' && row.RECIPIENT_USER_ID === pilotUser; }).length;
  const result = {
    pilot_enabled: phase2Property_(HIMAWARI_PHASE2.properties.pilotEnabled) === 'TRUE',
    pilot_folder_url: phase2Property_(HIMAWARI_PHASE2.properties.pilotFolderId) ? DriveApp.getFolderById(phase2Property_(HIMAWARI_PHASE2.properties.pilotFolderId)).getUrl() : '',
    job_counts: counts,
    pending_outbox: pending,
    trigger_count: ScriptApp.getProjectTriggers().filter(function(trigger) { return trigger.getHandlerFunction() === 'timetorigaa_phase2_10pun'; }).length,
    exit_url_configured: Boolean(phase2Property_(HIMAWARI_PHASE2.properties.exitUrl)),
    exit_secret_configured: Boolean(phase2Property_(HIMAWARI_PHASE2.properties.exitSecret)),
    test_now_cleared: !getConfig_('TEST_NOW'),
    secret_values_were_not_read_out: true
  };
  phase2PilotToast_('試運転: ' + (result.pilot_enabled ? '運転中' : '停止中') + ' / JOB ' + jobs.length + '件');
  return result;
}

function phase2PilotToast_(message) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (spreadsheet) spreadsheet.toast(message, '🌻ひまわり', 8);
}
