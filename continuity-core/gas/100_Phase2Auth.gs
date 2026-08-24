/** Phase 2で使うDrive・外部通信・トリガー管理のOAuthを一度に確認する。 */

function mazukore_phase2_no_ninshou() {
  const ss = assertDevSpreadsheet_();
  const properties = PropertiesService.getScriptProperties();

  DriveApp.getRootFolder().getName();
  const hitlSpreadsheet = SpreadsheetApp.openById(HIMAWARI.hitlSpreadsheetId);
  const hitlAnswerSheetReady = Boolean(hitlSpreadsheet.getSheetByName('HITL回答'));
  const hitlQueueSheetReady = Boolean(hitlSpreadsheet.getSheetByName('再開キュー'));
  const triggerCount = ScriptApp.getProjectTriggers().length;
  const response = UrlFetchApp.fetch(
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
    {method: 'get', muteHttpExceptions: true}
  );
  const externalStatus = response.getResponseCode();
  if (externalStatus < 200 || externalStatus >= 300) {
    throw new Error('外部通信の確認に失敗しました: HTTP ' + externalStatus);
  }

  const result = {
    spreadsheet_id_ok: ss.getId() === HIMAWARI.spreadsheetId,
    spreadsheet_name_ok: ss.getName() === HIMAWARI.spreadsheetName,
    drive_access_ok: true,
    external_request_ok: true,
    trigger_management_ok: true,
    hitl_spreadsheet_access_ok: true,
    hitl_answer_sheet_ready: hitlAnswerSheetReady,
    hitl_queue_sheet_ready: hitlQueueSheetReady,
    current_trigger_count: triggerCount,
    inbox_folder_configured: Boolean(properties.getProperty('HIMAWARI_INBOX_FOLDER_ID')),
    exit_api_url_configured: Boolean(properties.getProperty('HIMAWARI_EXIT_URL')),
    exit_api_secret_configured: Boolean(properties.getProperty('HIMAWARI_EXIT_SECRET')),
    gemini_api_key_configured: Boolean(properties.getProperty('GEMINI_API_KEY')),
    secret_values_were_not_read_out: true
  };
  console.log(JSON.stringify(result));
  return result;
}
