/** GASgraphの見た目だけを整える。データや状態は変更しない。 */

function saigokore_miekata_wo_totonou() {
  return withJobLock_(function() {
    assertDevSpreadsheet_();
    Object.keys(HIMAWARI.sheets).forEach(function(name) {
      formatContinuitySheet_(name);
    });
    log_('INFO', '', '', 'GASgraph presentation formatted', {});
    return {formatted_sheets: Object.keys(HIMAWARI.sheets)};
  });
}

function formatContinuitySheet_(name) {
  const sheet = sheet_(name);
  const headers = headers_(name);
  ensureHeader_(sheet, headers);

  headers.forEach(function(header, index) {
    sheet.setColumnWidth(index + 1, widthForHeader_(header));
  });

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const body = sheet.getRange(2, 1, lastRow - 1, headers.length);
  body
    .setFontColor('#202124')
    .setVerticalAlignment('top')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);

  sheet.setRowHeightsForced(2, lastRow - 1, bodyRowHeightForSheet_(name));
  formatTimestampColumns_(sheet, headers, lastRow);
  formatProgressColumn_(sheet, headers, lastRow);
}

function widthForHeader_(header) {
  if (/(JSON|DETAILS|PAYLOAD|ACTION|RESPONSE|OPTIONS)/.test(header)) return 360;
  if (/(MESSAGE_TEXT|QUESTION_TEXT|EXPECTED_OUTPUT|SUMMARY|NOTE)/.test(header)) return 280;
  if (/(SOURCE_NAME|OUTPUT_REF|NEXT_ACTION)/.test(header)) return 240;
  if (/_ID$|^IDEMPOTENCY_KEY$/.test(header)) return 220;
  if (/_AT$|^TIMESTAMP$/.test(header)) return 170;
  if (/^(PROGRESS|VERSION|RESPONSE_VERSION|LEVEL)$/.test(header)) return 95;
  if (/(STATUS|TYPE|USER_ID|ACTOR_ID)/.test(header)) return 145;
  return 135;
}

function bodyRowHeightForSheet_(name) {
  if (name === 'OUTBOX' || name === 'HITL') return 88;
  if (name === 'EVENTS' || name === 'LOG' || name === 'ARCHIVE') return 66;
  return 48;
}

function formatTimestampColumns_(sheet, headers, lastRow) {
  headers.forEach(function(header, index) {
    if (/_AT$|^TIMESTAMP$/.test(header)) {
      sheet.getRange(2, index + 1, lastRow - 1, 1).setNumberFormat('yyyy/mm/dd hh:mm:ss');
    }
  });
}

function formatProgressColumn_(sheet, headers, lastRow) {
  const index = headers.indexOf('PROGRESS');
  if (index >= 0) sheet.getRange(2, index + 1, lastRow - 1, 1).setNumberFormat('0');
}
