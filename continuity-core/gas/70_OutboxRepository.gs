/** Google Chatへ交換可能な一か所のメッセージ出力口を提供する。 */

function enqueueMessage_(jobId, messageType, userId, text, actions) {
  const existing = findObject_('OUTBOX', function(row) {
    return row.JOB_ID === jobId && row.MESSAGE_TYPE === messageType;
  });
  if (existing) return {created: false, message: existing};
  const message = {
    MESSAGE_ID: newId_('MSG'),
    JOB_ID: jobId,
    MESSAGE_TYPE: messageType,
    RECIPIENT_USER_ID: userId,
    MESSAGE_TEXT: text,
    ACTION_JSON: json_(actions || []),
    CREATED_AT: now_(),
    STATUS: 'PENDING'
  };
  appendObject_('OUTBOX', message);
  return {created: true, message: message};
}

function createDelivery_(jobId, outputRef, summary, eventId) {
  const existing = findObject_('DELIVERIES', function(row) { return row.JOB_ID === jobId; });
  if (existing) return existing;
  const delivery = {
    DELIVERY_ID: newId_('DLV'),
    JOB_ID: jobId,
    OUTPUT_REF: outputRef,
    SUMMARY: summary,
    DELIVERED_AT: now_(),
    STATUS: 'DELIVERED',
    EVENT_ID: eventId
  };
  appendObject_('DELIVERIES', delivery);
  return delivery;
}
