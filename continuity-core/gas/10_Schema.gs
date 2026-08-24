/** GASgraphのシート作成、列検証、共通行操作を担当する。 */

function mazukore_setupDevGASgraph() {
  return withJobLock_(function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('この関数は開発用Spreadsheetに紐づけて実行してください。');
    if (ss.getId() !== HIMAWARI.spreadsheetId || ss.getName() !== HIMAWARI.spreadsheetName) {
      throw new Error('対象Spreadsheetが違います。安全のため停止しました: ' + ss.getName());
    }
    ss.setSpreadsheetTimeZone(HIMAWARI.timeZone);
    const initialSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('シート1');
    if (!ss.getSheetByName('JOBS') && initialSheet && ss.getSheets().length === 1 && initialSheet.getDataRange().isBlank()) {
      initialSheet.setName('JOBS');
    }
    Object.keys(HIMAWARI.sheets).forEach(function(name) {
      let sheet = ss.getSheetByName(name);
      if (!sheet) sheet = ss.insertSheet(name);
      ensureHeader_(sheet, HIMAWARI.sheets[name]);
    });
    setConfig_('TIME_ZONE', HIMAWARI.timeZone, 'Continuity Coreの基準タイムゾーン');
    log_('INFO', '', '', 'DEV GASgraph schema ready', {spreadsheet_id: ss.getId()});
    return {spreadsheet_id: ss.getId(), spreadsheet_url: ss.getUrl(), sheets: Object.keys(HIMAWARI.sheets)};
  });
}

function ensureHeader_(sheet, headers) {
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const hasData = current.some(function(value) { return value !== ''; });
  if (hasData && JSON.stringify(current) !== JSON.stringify(headers)) {
    throw new Error(sheet.getName() + ' のヘッダーが正規スキーマと異なります。');
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setFontColor('#202124')
    .setBackground('#f1f3f4')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);
}

function resetDemoData_() {
  assertDevSpreadsheet_();
  Object.keys(HIMAWARI.sheets).forEach(function(name) {
    const sheet = sheet_(name);
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
    ensureHeader_(sheet, HIMAWARI.sheets[name]);
  });
  setConfig_('TIME_ZONE', HIMAWARI.timeZone, 'Continuity Coreの基準タイムゾーン');
}

function assertDevSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== HIMAWARI.spreadsheetId || ss.getName() !== HIMAWARI.spreadsheetName) {
    throw new Error('スーパー🌻専用DEV Spreadsheet以外では実行できません。');
  }
  return ss;
}

function sheet_(name) {
  const sheet = assertDevSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('必要なシートがありません: ' + name);
  return sheet;
}

function headers_(name) {
  return HIMAWARI.sheets[name];
}

function readObjects_(name) {
  const sheet = sheet_(name);
  const headers = headers_(name);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function(row, index) {
    const obj = {_row: index + 2};
    headers.forEach(function(header, i) { obj[header] = row[i]; });
    return obj;
  });
}

function appendObject_(name, obj) {
  const headers = headers_(name);
  const row = headers.map(function(header) { return obj[header] === undefined ? '' : obj[header]; });
  sheet_(name).appendRow(row);
  return sheet_(name).getLastRow();
}

function updateObjectRow_(name, rowNumber, patch) {
  const sheet = sheet_(name);
  const headers = headers_(name);
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  const row = range.getValues()[0];
  headers.forEach(function(header, index) {
    if (Object.prototype.hasOwnProperty.call(patch, header)) row[index] = patch[header];
  });
  range.setValues([row]);
}

function findObject_(name, predicate) {
  const rows = readObjects_(name);
  for (let i = 0; i < rows.length; i += 1) {
    if (predicate(rows[i])) return rows[i];
  }
  return null;
}

function setConfig_(key, value, note) {
  const existing = findObject_('CONFIG', function(row) { return row.KEY === key; });
  if (existing) updateObjectRow_('CONFIG', existing._row, {VALUE: value, NOTE: note || existing.NOTE});
  else appendObject_('CONFIG', {KEY: key, VALUE: value, NOTE: note || ''});
}

function getConfig_(key) {
  const row = findObject_('CONFIG', function(item) { return item.KEY === key; });
  return row ? row.VALUE : '';
}

function json_(value) {
  return JSON.stringify(value === undefined ? {} : value);
}

function newId_(prefix) {
  return prefix + '_' + Utilities.getUuid();
}
