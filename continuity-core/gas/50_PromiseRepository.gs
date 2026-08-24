/** 翌朝返却の約束を作成し、成功・確認待ち・失敗として回収する。 */

function createPromise_(jobId, userId) {
  const existing = findObject_('PROMISES', function(row) {
    return row.JOB_ID === jobId && row.STATUS === 'OPEN';
  });
  if (existing) return existing;
  const promise = {
    PROMISE_ID: newId_('PRM'),
    JOB_ID: jobId,
    USER_ID: userId,
    PROMISED_AT: now_(),
    DUE_AT: new Date('2026-08-25T08:00:00+09:00'),
    PROMISE_TYPE: 'MORNING_PROGRESS',
    EXPECTED_OUTPUT: 'Excel処理の進捗または失敗状況を翌朝に返す',
    STATUS: 'OPEN',
    FULFILLED_AT: '',
    RESULT_EVENT_ID: '',
    NOTE: ''
  };
  appendObject_('PROMISES', promise);
  return findObject_('PROMISES', function(row) { return row.PROMISE_ID === promise.PROMISE_ID; });
}

function resolvePromise_(promiseId, status, resultEventId, note) {
  const promise = findObject_('PROMISES', function(row) { return row.PROMISE_ID === promiseId; });
  if (!promise) throw new Error('PROMISEがありません: ' + promiseId);
  if (promise.STATUS !== 'OPEN') return promise;
  if (['FULFILLED', 'WAIT_HITL', 'FAILED'].indexOf(status) === -1) {
    throw new Error('PROMISEの回収状態が不正です: ' + status);
  }
  updateObjectRow_('PROMISES', promise._row, {
    STATUS: status,
    FULFILLED_AT: now_(),
    RESULT_EVENT_ID: resultEventId,
    NOTE: note || ''
  });
  return findObject_('PROMISES', function(row) { return row.PROMISE_ID === promiseId; });
}
