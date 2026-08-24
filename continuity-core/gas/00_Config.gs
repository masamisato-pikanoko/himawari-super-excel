/** スーパー🌻 Continuity Coreの定数・正規スキーマを定義する。 */

const HIMAWARI = Object.freeze({
  spreadsheetId: '1hHZSD4W1Hzu5bCBynyhIU2UH9T6AHWmMmCn8KddKoNw',
  spreadsheetName: '🌻ひまわりシステム🌻',
  hitlSpreadsheetId: '11Xh_64ccreR6fsTQuO9oOr_yuQFZipylwyV3yvtRSsQ',
  timeZone: 'Asia/Tokyo',
  demo: Object.freeze({
    jobId: 'EXCEL_DEMO_001',
    userId: 'USER_DEMO_001',
    jobType: 'EXCEL_CLEANUP',
    sourceName: '絶望Excel_営業部_A.xlsx',
    outputRef: 'drive://demo/絶望Excel_営業部_A_改訂版.xlsx'
  }),
  sheets: Object.freeze({
    JOBS: ['JOB_ID','USER_ID','JOB_TYPE','SOURCE_NAME','STATUS','PROGRESS','NEXT_ACTION','RECEIVED_AT','UPDATED_AT','OUTPUT_REF','CURRENT_PROMISE_ID','CURRENT_HITL_ID','VERSION','NOTE'],
    EVENTS: ['EVENT_ID','JOB_ID','EVENT_TYPE','OCCURRED_AT','ACTOR_TYPE','ACTOR_ID','PAYLOAD_JSON','IDEMPOTENCY_KEY'],
    PROMISES: ['PROMISE_ID','JOB_ID','USER_ID','PROMISED_AT','DUE_AT','PROMISE_TYPE','EXPECTED_OUTPUT','STATUS','FULFILLED_AT','RESULT_EVENT_ID','NOTE'],
    HITL: ['HITL_ID','JOB_ID','QUESTION_ID','QUESTION_TEXT','OPTIONS_JSON','STATUS','ASSIGNED_USER_ID','CREATED_AT','EXPIRES_AT','RESPONSE_JSON','RESPONSE_EVENT_ID','RESPONDED_AT','RESPONSE_VERSION'],
    DELIVERIES: ['DELIVERY_ID','JOB_ID','OUTPUT_REF','SUMMARY','DELIVERED_AT','STATUS','EVENT_ID'],
    OUTBOX: ['MESSAGE_ID','JOB_ID','MESSAGE_TYPE','RECIPIENT_USER_ID','MESSAGE_TEXT','ACTION_JSON','CREATED_AT','STATUS'],
    CONFIG: ['KEY','VALUE','NOTE'],
    LOG: ['LOG_ID','TIMESTAMP','LEVEL','JOB_ID','EVENT_ID','MESSAGE','DETAILS_JSON'],
    ARCHIVE: ['ARCHIVE_ID','RECORD_TYPE','RECORD_ID','JOB_ID','ARCHIVED_AT','PAYLOAD_JSON','NOTE']
  }),
  jobStatus: Object.freeze({
    RECEIVED: 'RECEIVED',
    QUEUED: 'QUEUED',
    ACTIVE: 'ACTIVE',
    WAIT_HITL: 'WAIT_HITL',
    DONE: 'DONE',
    FAILED: 'FAILED',
    CLOSED: 'CLOSED'
  }),
  eventType: Object.freeze({
    JOB_RECEIVED: 'JOB_RECEIVED',
    PROMISE_CREATED: 'PROMISE_CREATED',
    NIGHT_HANDOFF: 'NIGHT_HANDOFF',
    WORKER_STARTED: 'WORKER_STARTED',
    WAIT_HITL_CREATED: 'WAIT_HITL_CREATED',
    MORNING_HANDOFF_CREATED: 'MORNING_HANDOFF_CREATED',
    HITL_RESPONSE_RECEIVED: 'HITL_RESPONSE_RECEIVED',
    WORKER_RESUMED: 'WORKER_RESUMED',
    JOB_COMPLETED: 'JOB_COMPLETED',
    DELIVERY_CREATED: 'DELIVERY_CREATED',
    FEEDBACK_PROMPT_CREATED: 'FEEDBACK_PROMPT_CREATED',
    WORKER_FAILED: 'WORKER_FAILED'
  })
});

function mazukore_hajimete_no_ninshou() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== HIMAWARI.spreadsheetId) {
    throw new Error('指定された🌻ひまわりシステム🌻以外なので停止しました。');
  }
  const properties = PropertiesService.getScriptProperties();
  const result = {
    spreadsheet_id_ok: true,
    spreadsheet_name: ss.getName(),
    gemini_api_key_set: Boolean(properties.getProperty('GEMINI_API_KEY')),
    google_api_key_set: Boolean(properties.getProperty('GOOGLE_API_KEY')),
    key_value_was_not_read_out: true
  };
  console.log(JSON.stringify(result));
  return result;
}
