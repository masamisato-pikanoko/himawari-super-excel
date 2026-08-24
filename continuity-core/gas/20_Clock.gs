/** 実時刻とCONFIGのテスト時刻を一か所で切り替える。 */

function now_() {
  const testNow = getConfig_('TEST_NOW');
  if (testNow instanceof Date && !isNaN(testNow.getTime())) return new Date(testNow.getTime());
  if (testNow) {
    const parsed = new Date(String(testNow));
    if (isNaN(parsed.getTime())) throw new Error('CONFIG.TEST_NOWを日時として解釈できません: ' + testNow);
    return parsed;
  }
  return new Date();
}

function setTestNow_(isoText) {
  const parsed = new Date(isoText);
  if (isNaN(parsed.getTime())) throw new Error('テスト時刻が不正です: ' + isoText);
  setConfig_('TEST_NOW', isoText, 'デモ用。空欄なら実時刻を使用');
  return parsed;
}

function formatTokyo_(date) {
  return Utilities.formatDate(date, HIMAWARI.timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}
