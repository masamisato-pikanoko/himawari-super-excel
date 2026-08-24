/** Drive原本を変更せず、JOB専用フォルダへ保全コピーして版付き封筒を作る。 */

function mazukore_phase2_dev_uketsuke_wo_tsukuru() {
  return withJobLock_(function() {
    assertDevSpreadsheet_();
    const root = phase2GetOrCreateChildFolder_(DriveApp.getRootFolder(), '🌻ひまわりシステム_DEV');
    const inbox = phase2GetOrCreateChildFolder_(root, 'INBOX');
    const jobs = phase2GetOrCreateChildFolder_(root, 'JOBS');
    phase2SetNonSecretProperty_(HIMAWARI_PHASE2.properties.rootFolderId, root.getId(), 'Phase 2 DEV root folder');
    phase2SetNonSecretProperty_(HIMAWARI_PHASE2.properties.inboxFolderId, inbox.getId(), 'Phase 2 Excel intake folder');
    phase2SetNonSecretProperty_(HIMAWARI_PHASE2.properties.jobsFolderId, jobs.getId(), 'Phase 2 isolated job folders');
    return {
      root_folder_url: root.getUrl(),
      inbox_folder_url: inbox.getUrl(),
      jobs_folder_url: jobs.getUrl(),
      existing_sources_were_not_changed: true
    };
  });
}

function phase2GetOrCreateChildFolder_(parent, name) {
  const matches = parent.getFoldersByName(name);
  return matches.hasNext() ? matches.next() : parent.createFolder(name);
}

function mazukore_phase2_file_wo_uketsukeru(fileId, userId) {
  return withJobLock_(function() {
    assertDevSpreadsheet_();
    if (!fileId || !userId) throw new Error('fileIdとuserIdが必要です。');
    const jobsFolderId = phase2Property_(HIMAWARI_PHASE2.properties.jobsFolderId);
    if (!jobsFolderId) throw new Error('先に mazukore_phase2_dev_uketsuke_wo_tsukuru を実行してください。');

    const source = DriveApp.getFileById(String(fileId));
    const mimeType = source.getMimeType();
    if (HIMAWARI_PHASE2.excelMimeTypes.indexOf(mimeType) === -1) {
      throw new Error('Excel原本だけを受付できます: ' + mimeType);
    }
    const blob = source.getBlob();
    const bytes = blob.getBytes();
    if (bytes.length > HIMAWARI_PHASE2.maxWorkbookBytes) throw new Error('Excel原本が50MBを超えています。');
    const sha256 = phase2Sha256Hex_(bytes);
    const jobId = 'XLSX_' + phase2Sha256Hex_(Utilities.newBlob(source.getId() + '|' + sha256).getBytes()).slice(0, 24).toUpperCase();

    const existing = getJob_(jobId);
    if (existing) return {created: false, job_id: jobId, job: existing};

    const jobFolder = DriveApp.getFolderById(jobsFolderId).createFolder(jobId);
    const originalFolder = jobFolder.createFolder('original');
    const artifactsFolder = jobFolder.createFolder('artifacts');
    const originalCopy = source.makeCopy(source.getName(), originalFolder);
    const metadata = {
      source_file_id: source.getId(),
      source_name: source.getName(),
      source_url: source.getUrl(),
      source_mime_type: mimeType,
      source_size_bytes: bytes.length,
      source_sha256: sha256,
      preserved_original_file_id: originalCopy.getId(),
      preserved_original_url: originalCopy.getUrl(),
      job_folder_id: jobFolder.getId(),
      job_folder_url: jobFolder.getUrl(),
      artifacts_folder_id: artifactsFolder.getId(),
      source_was_not_modified: true
    };

    createJob_({
      JOB_ID: jobId,
      USER_ID: String(userId),
      JOB_TYPE: 'SUPER_EXCEL',
      SOURCE_NAME: source.getName(),
      NOTE: 'Drive原本を保全コピー済み。Worker封筒v1を参照。'
    });
    const received = recordEvent_(jobId, HIMAWARI.eventType.JOB_RECEIVED, 'USER', String(userId), metadata);
    const promise = createPromise_(jobId, String(userId));
    const envelope = phase2BuildWorkerEnvelope_(getJob_(jobId), metadata, promise);
    phase2WriteJsonArtifact_(artifactsFolder, 'uketori.json', metadata);
    const envelopeFile = phase2WriteJsonArtifact_(artifactsFolder, 'worker-envelope.v1.json', envelope);
    recordEvent_(jobId, HIMAWARI.eventType.PROMISE_CREATED, 'SYSTEM', 'ContinuityService', {
      promise_id: promise.PROMISE_ID,
      due_at: formatTokyo_(promise.DUE_AT),
      worker_envelope_file_id: envelopeFile.getId(),
      worker_envelope_url: envelopeFile.getUrl()
    });
    patchJob_(jobId, {
      STATUS: HIMAWARI.jobStatus.QUEUED,
      NEXT_ACTION: 'RUN_SUPER_EXCEL_WORKER',
      CURRENT_PROMISE_ID: promise.PROMISE_ID
    });
    enqueueMessage_(jobId, 'RECEIVED', String(userId), messageReceived_(), []);
    enqueueMessage_(jobId, 'NIGHT_HANDOFF', String(userId), messageEvening_(), []);
    log_('INFO', jobId, received.event.EVENT_ID, 'Excel source preserved and worker envelope created', {
      source_file_id: source.getId(), source_sha256: sha256, source_was_not_modified: true
    });
    return {
      created: true,
      job_id: jobId,
      job_folder_url: jobFolder.getUrl(),
      preserved_original_url: originalCopy.getUrl(),
      worker_envelope_url: envelopeFile.getUrl(),
      source_sha256: sha256
    };
  });
}

function phase2BuildWorkerEnvelope_(job, metadata, promise) {
  const envelope = {
    contract_version: HIMAWARI_PHASE2.envelopeVersion,
    job_id: job.JOB_ID,
    user_id: job.USER_ID,
    job_type: job.JOB_TYPE,
    source: {
      file_id: metadata.source_file_id,
      name: metadata.source_name,
      mime_type: metadata.source_mime_type,
      size_bytes: metadata.source_size_bytes,
      sha256: metadata.source_sha256,
      preserved_original_file_id: metadata.preserved_original_file_id
    },
    destinations: {
      job_folder_id: metadata.job_folder_id,
      artifacts_folder_id: metadata.artifacts_folder_id
    },
    promise: {
      promise_id: promise.PROMISE_ID,
      due_at: formatTokyo_(promise.DUE_AT)
    },
    rules: {
      preserve_original: true,
      maximum_hitl_questions: 2,
      resume_same_job_only: true,
      employee_facing_ai_only_at_exit: true
    }
  };
  phase2AssertNoRawOrSecret_(envelope);
  return envelope;
}

function phase2WriteJsonArtifact_(folder, name, value) {
  return folder.createFile(name, JSON.stringify(value, null, 2), MimeType.PLAIN_TEXT);
}
