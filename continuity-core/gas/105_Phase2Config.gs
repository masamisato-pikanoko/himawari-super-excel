/** Phase 2の非秘密設定、日付計算、受け渡しメタデータを集約する。 */

const HIMAWARI_PHASE2 = Object.freeze({
  envelopeVersion: 'himawari.worker-envelope.v1',
  workerUpdateVersion: 'himawari.worker-update.v1',
  maxWorkbookBytes: 50 * 1024 * 1024,
  excelMimeTypes: Object.freeze([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12'
  ]),
  properties: Object.freeze({
    rootFolderId: 'HIMAWARI_DEV_ROOT_FOLDER_ID',
    inboxFolderId: 'HIMAWARI_INBOX_FOLDER_ID',
    jobsFolderId: 'HIMAWARI_JOBS_FOLDER_ID',
    exitUrl: 'HIMAWARI_EXIT_URL',
    exitSecret: 'HIMAWARI_EXIT_SECRET',
    exitKeyId: 'HIMAWARI_EXIT_KEY_ID',
    pilotFolderId: 'HIMAWARI_PILOT_FOLDER_ID',
    pilotEnabled: 'HIMAWARI_PILOT_ENABLED',
    pilotUserId: 'HIMAWARI_PILOT_USER_ID',
    pilotImmediate: 'HIMAWARI_PILOT_IMMEDIATE'
  })
});

function nextMorningAt_(baseDate, hour) {
  const dayText = Utilities.formatDate(baseDate, HIMAWARI.timeZone, 'yyyy-MM-dd');
  const midnight = new Date(dayText + 'T00:00:00+09:00');
  return new Date(midnight.getTime() + 24 * 60 * 60 * 1000 + Number(hour || 8) * 60 * 60 * 1000);
}

function phase2Property_(name) {
  return PropertiesService.getScriptProperties().getProperty(name) || '';
}

function phase2SetNonSecretProperty_(name, value, note) {
  PropertiesService.getScriptProperties().setProperty(name, String(value));
  setConfig_(name, String(value), note || 'Phase 2 non-secret configuration');
}

function phase2Sha256Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); })
    .join('');
}

function phase2SafeJsonParse_(text, label) {
  try {
    return JSON.parse(String(text || '{}'));
  } catch (error) {
    throw new Error((label || 'JSON') + 'を解釈できません。');
  }
}

function phase2JobMetadata_(jobId) {
  const received = readObjects_('EVENTS').filter(function(row) {
    return row.JOB_ID === jobId && row.EVENT_TYPE === HIMAWARI.eventType.JOB_RECEIVED;
  })[0];
  if (!received) throw new Error('JOB_RECEIVEDイベントがありません: ' + jobId);
  return phase2SafeJsonParse_(received.PAYLOAD_JSON, 'JOB_RECEIVED.PAYLOAD_JSON');
}

function phase2AssertNoRawOrSecret_(value) {
  const forbiddenKeys = {
    base64:true,blob:true,bytes:true,file_bytes:true,raw_bytes:true,content_bytes:true,
    gemini_api_key:true,himawari_exit_secret:true,api_key:true,access_token:true
  };
  function walk_(item) {
    if (!item || typeof item !== 'object') return;
    Object.keys(item).forEach(function(key) {
      if (forbiddenKeys[String(key).toLowerCase()]) {
        throw new Error('Worker封筒に禁止フィールドが含まれています: ' + key);
      }
      walk_(item[key]);
    });
  }
  walk_(value);
  return true;
}
