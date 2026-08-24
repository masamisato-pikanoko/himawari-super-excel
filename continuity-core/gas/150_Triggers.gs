/** Phase 2の定期処理。安全条件がそろうまでトリガーを作らない。 */

function timetorigaa_phase2_10pun() {
  const resume = tsugikore_phase2_HITL_kaitou_wo_hirou();
  const delivery = saigokore_phase2_OUTBOX_wo_dekiguchi_ni_okuru();
  return {resume: resume, delivery: delivery};
}

function saigokore_phase2_10pun_torigaa_wo_tsukuru() {
  assertDevSpreadsheet_();
  if (getConfig_('TEST_NOW')) throw new Error('CONFIG.TEST_NOWを空欄にしてからトリガーを作ってください。');
  const required = [
    HIMAWARI_PHASE2.properties.inboxFolderId,
    HIMAWARI_PHASE2.properties.jobsFolderId,
    HIMAWARI_PHASE2.properties.exitUrl,
    HIMAWARI_PHASE2.properties.exitSecret
  ];
  const missing = required.filter(function(name) { return !phase2Property_(name); });
  if (missing.length) throw new Error('トリガー条件が不足しています: ' + missing.join(', '));
  const existing = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === 'timetorigaa_phase2_10pun';
  });
  if (existing.length) return {created: false, trigger_count: existing.length};
  ScriptApp.newTrigger('timetorigaa_phase2_10pun').timeBased().everyMinutes(10).create();
  return {created: true, trigger_count: 1};
}
