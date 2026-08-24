/** 昨日から翌朝へつなぐ固定メッセージと状態更新を集約する。 */

function messageReceived_() {
  return '🌻Excel、お預かりしました！';
}

function messageEvening_() {
  return '🌻今日も一日、お疲れ様でした！\n\n今夜はこちらのExcelを進めます。\n明朝、進捗をお持ちします。';
}

function messageMorningWaitHitl_(progress) {
  return '🌻おはようございます！\n\n昨日お預かりしたExcelは' + progress + '%まで進みました。\n仕上げのため、2点確認させてください。';
}

function messageMorningDone_() {
  return '🌻おはようございます！\n\n昨日お預かりしたExcelの改訂が完了しました。';
}

function messageMorningFailed_() {
  return '🌻おはようございます！\n\n昨日お預かりしたExcelは、夜間処理中に問題が見つかりました。\n状況を記録し、安全に停止しています。';
}

function messageAcknowledged_() {
  return '🌻承知しました。続きを進めます！';
}

function messageCompleted_() {
  return '🌻お待たせしました！\n\n昨日お預かりしたExcelの改訂が完了しました。\n確認いただいた内容を反映しています。';
}

function messageFeedback_() {
  return '🌻今後のために、今回の訂正内容を記録させていただいても\nよろしいでしょうか？';
}
