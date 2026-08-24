/** EVENTSの追記、冪等キー、排他ロックを担当する。 */

function withJobLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function makeIdempotencyKey_(jobId, eventType, questionId, responseVersion) {
  const raw = [jobId, eventType, questionId || '', responseVersion || ''].join('|');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return digest.map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function findEventByKey_(idempotencyKey) {
  return findObject_('EVENTS', function(row) { return row.IDEMPOTENCY_KEY === idempotencyKey; });
}

function recordEvent_(jobId, eventType, actorType, actorId, payload, questionId, responseVersion) {
  const key = makeIdempotencyKey_(jobId, eventType, questionId, responseVersion);
  const existing = findEventByKey_(key);
  if (existing) return {created: false, event: existing};
  const eventId = newId_('EVT');
  const event = {
    EVENT_ID: eventId,
    JOB_ID: jobId,
    EVENT_TYPE: eventType,
    OCCURRED_AT: now_(),
    ACTOR_TYPE: actorType,
    ACTOR_ID: actorId,
    PAYLOAD_JSON: json_(payload),
    IDEMPOTENCY_KEY: key
  };
  appendObject_('EVENTS', event);
  return {created: true, event: event};
}

function log_(level, jobId, eventId, message, details) {
  appendObject_('LOG', {
    LOG_ID: newId_('LOG'),
    TIMESTAMP: now_(),
    LEVEL: level,
    JOB_ID: jobId || '',
    EVENT_ID: eventId || '',
    MESSAGE: message,
    DETAILS_JSON: json_(details)
  });
}
