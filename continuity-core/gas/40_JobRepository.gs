/** JOBSの作成、取得、状態遷移、版管理を担当する。 */

function getJob_(jobId) {
  return findObject_('JOBS', function(row) { return row.JOB_ID === jobId; });
}

function createJob_(input) {
  const existing = getJob_(input.JOB_ID);
  if (existing) return {created: false, job: existing};
  const now = now_();
  const job = {
    JOB_ID: input.JOB_ID,
    USER_ID: input.USER_ID,
    JOB_TYPE: input.JOB_TYPE,
    SOURCE_NAME: input.SOURCE_NAME,
    STATUS: HIMAWARI.jobStatus.RECEIVED,
    PROGRESS: 0,
    NEXT_ACTION: 'CREATE_EVENING_HANDOFF',
    RECEIVED_AT: now,
    UPDATED_AT: now,
    OUTPUT_REF: '',
    CURRENT_PROMISE_ID: '',
    CURRENT_HITL_ID: '',
    VERSION: 1,
    NOTE: input.NOTE || ''
  };
  appendObject_('JOBS', job);
  return {created: true, job: getJob_(input.JOB_ID)};
}

function patchJob_(jobId, patch) {
  const job = getJob_(jobId);
  if (!job) throw new Error('JOBがありません: ' + jobId);
  if (patch.STATUS && patch.STATUS !== job.STATUS) assertJobTransition_(job.STATUS, patch.STATUS);
  patch.UPDATED_AT = now_();
  patch.VERSION = Number(job.VERSION || 0) + 1;
  updateObjectRow_('JOBS', job._row, patch);
  return getJob_(jobId);
}

function assertJobTransition_(current, target) {
  const allowed = {};
  allowed[HIMAWARI.jobStatus.RECEIVED] = [HIMAWARI.jobStatus.QUEUED, HIMAWARI.jobStatus.ACTIVE, HIMAWARI.jobStatus.CLOSED];
  allowed[HIMAWARI.jobStatus.QUEUED] = [HIMAWARI.jobStatus.ACTIVE, HIMAWARI.jobStatus.FAILED, HIMAWARI.jobStatus.CLOSED];
  allowed[HIMAWARI.jobStatus.ACTIVE] = [HIMAWARI.jobStatus.WAIT_HITL, HIMAWARI.jobStatus.DONE, HIMAWARI.jobStatus.FAILED];
  allowed[HIMAWARI.jobStatus.WAIT_HITL] = [HIMAWARI.jobStatus.ACTIVE, HIMAWARI.jobStatus.FAILED, HIMAWARI.jobStatus.CLOSED];
  allowed[HIMAWARI.jobStatus.FAILED] = [HIMAWARI.jobStatus.ACTIVE, HIMAWARI.jobStatus.CLOSED];
  allowed[HIMAWARI.jobStatus.DONE] = [HIMAWARI.jobStatus.CLOSED];
  allowed[HIMAWARI.jobStatus.CLOSED] = [];
  if ((allowed[current] || []).indexOf(target) === -1) {
    throw new Error('許可されていないJOB状態遷移です: ' + current + ' -> ' + target);
  }
}

function requireRunnableJob_(jobId) {
  const job = getJob_(jobId);
  if (!job) throw new Error('JOBがありません: ' + jobId);
  if (job.STATUS === HIMAWARI.jobStatus.DONE || job.STATUS === HIMAWARI.jobStatus.CLOSED) {
    throw new Error('完了済みJOBは再実行できません: ' + jobId);
  }
  return job;
}
