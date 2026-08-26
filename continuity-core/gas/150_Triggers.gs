/** Phase 2の定期処理。安全条件がそろうまでトリガーを作らない。 */

function timetorigaa_phase2_10pun() {
  if (phase2Property_(HIMAWARI_PHASE2.properties.pilotEnabled) !== 'TRUE') {
    return {pilot_enabled:false,intake:{created:0},worker:{wait_hitl:0,done:0,failed:0},resume:{accepted:0},delivery:{sent:0}};
  }
  const intake = tsugikore_shiire_bako_wo_kakunin();
  const workerBefore = tsugikore_windows_worker_no_kekka_wo_hirou();
  const resume = tsugikore_phase2_HITL_kaitou_wo_hirou();
  const workerAfter = tsugikore_windows_worker_no_kekka_wo_hirou();
  const delivery = saigokore_phase2_OUTBOX_wo_dekiguchi_ni_okuru();
  return {pilot_enabled:true,intake:intake,worker_before:workerBefore,resume:resume,worker_after:workerAfter,delivery:delivery};
}

function saigokore_phase2_10pun_torigaa_wo_tsukuru() {
  assertDevSpreadsheet_();
  if (getConfig_('TEST_NOW')) throw new Error('CONFIG.TEST_NOWを空欄にしてからトリガーを作ってください。');
  const required = [
    HIMAWARI_PHASE2.properties.inboxFolderId,
    HIMAWARI_PHASE2.properties.jobsFolderId,
    HIMAWARI_PHASE2.properties.pilotFolderId,
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
