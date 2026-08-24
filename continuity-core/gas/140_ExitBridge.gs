/** OUTBOXを既存の出口API契約へ変換する。明示実行までは送信しない。 */

function phase2ExitPayloadForMessage_(message) {
  const job = getJob_(message.JOB_ID);
  if (!job) throw new Error('OUTBOXのJOBがありません: ' + message.JOB_ID);
  const actions = phase2SafeJsonParse_(message.ACTION_JSON || '[]', 'OUTBOX.ACTION_JSON');
  if (message.MESSAGE_TYPE === 'MORNING_WAIT_HITL') {
    if (!Array.isArray(actions) || actions.length !== 2) throw new Error('朝の出口にはちょうど2問必要です。');
    return {
      action: 'deliver_morning',
      job_id: job.JOB_ID,
      employee_name: '',
      completed_summary: ['夜間の安全な自動処理を完了', '仕上げ前の確認待ち'],
      questions: actions.map(function(item) {
        return {
          question_id: item.question_id,
          question: item.text,
          reason: item.contract.reason,
          impact: item.contract.impact,
          options: item.contract.options,
          recommended_option_id: item.contract.recommended_option_id
        };
      })
    };
  }
  if (message.MESSAGE_TYPE === 'COMPLETED' || message.MESSAGE_TYPE === 'MORNING_DONE') {
    const delivery = findObject_('DELIVERIES', function(row) { return row.JOB_ID === job.JOB_ID; });
    const outputUrl = delivery ? delivery.OUTPUT_REF : job.OUTPUT_REF;
    if (!/^https:\/\/(?:drive|docs)\.google\.com\//i.test(String(outputUrl || ''))) throw new Error('完成出口にDrive URLがありません。');
    return {
      action: 'deliver_complete',
      job_id: job.JOB_ID,
      employee_name: '',
      completed_summary: [delivery ? delivery.SUMMARY : 'Excel処理が完了しました。'],
      output_name: job.SOURCE_NAME.replace(/\.xls[mx]?$/i, '') + '_🌻完成.xlsx',
      output_url: outputUrl
    };
  }
  throw new Error('出口APIへ送らないOUTBOX種別です: ' + message.MESSAGE_TYPE);
}

function tsugikore_phase2_dekiguchi_no_dry_run() {
  const rows = readObjects_('OUTBOX').filter(function(row) { return row.STATUS === 'PENDING'; });
  const previews = [];
  rows.forEach(function(row) {
    if (['MORNING_WAIT_HITL','COMPLETED','MORNING_DONE'].indexOf(row.MESSAGE_TYPE) === -1) return;
    previews.push({message_id: row.MESSAGE_ID, payload: phase2ExitPayloadForMessage_(row)});
  });
  return {send_count: 0, dry_run: true, previews: previews};
}

function saigokore_phase2_OUTBOX_wo_dekiguchi_ni_okuru() {
  return withJobLock_(function() {
    const url = phase2Property_(HIMAWARI_PHASE2.properties.exitUrl);
    const secret = phase2Property_(HIMAWARI_PHASE2.properties.exitSecret);
    if (!url || !secret) return {sent: 0, blocked: true, reason: 'EXIT_API_NOT_CONFIGURED'};
    const rows = readObjects_('OUTBOX').filter(function(row) { return row.STATUS === 'PENDING'; });
    let sent = 0;
    rows.forEach(function(row) {
      if (['MORNING_WAIT_HITL','COMPLETED','MORNING_DONE'].indexOf(row.MESSAGE_TYPE) === -1) return;
      const payload = phase2ExitPayloadForMessage_(row);
      const result = phase2CallExitApi_(url, secret, payload);
      updateObjectRow_('OUTBOX', row._row, {STATUS: 'SENT'});
      log_('INFO', row.JOB_ID, '', 'OUTBOX delivered through exit API', {message_id: row.MESSAGE_ID, request_id: result.request_id || ''});
      sent += 1;
    });
    return {sent: sent, blocked: false};
  });
}

function phase2CallExitApi_(url, secret, payload) {
  const timestamp = Date.now();
  const nonce = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const payloadJson = JSON.stringify(payload);
  const signingText = timestamp + '.' + nonce + '.' + payloadJson;
  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(signingText, String(secret), Utilities.Charset.UTF_8)
  ).replace(/=+$/g, '');
  const response = UrlFetchApp.fetch(String(url), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({version: 1, timestamp: timestamp, nonce: nonce, payload_json: payloadJson, signature: signature}),
    muteHttpExceptions: true
  });
  const body = phase2SafeJsonParse_(response.getContentText() || '{}', '出口API応答');
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || body.ok !== true) {
    throw new Error('出口APIが安全に完了しませんでした: HTTP ' + response.getResponseCode());
  }
  return body;
}
