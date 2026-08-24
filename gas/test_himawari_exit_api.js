'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(
  'C:/Users/sosin/Documents/Codex/2026-08-23/c/work/himawari-exit-api/🌻出口API.gs',
  'utf8'
);

const properties = new Map([
  ['GEMINI_API_KEY', 'synthetic-gemini-key'],
  ['HIMAWARI_EXIT_API_SECRET', 'synthetic-signing-secret'],
  ['HIMAWARI_CHAT_WEBHOOK_URL', 'https://chat.googleapis.com/v1/spaces/SYNTHETIC/messages?key=test&token=test']
]);
const nonces = new Map();
const chatPosts = [];
let fetchMode = 'success';

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

const context = {
  Array,
  Date,
  Error,
  JSON,
  Math,
  Number,
  Object,
  RegExp,
  String,
  console: { log() {}, error() {} },
  isFinite,
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(name) { return properties.get(name) || null; },
        setProperty(name, value) { properties.set(name, String(value)); }
      };
    }
  },
  CacheService: {
    getScriptCache() {
      return {
        get(key) { return nonces.get(key) || null; },
        put(key, value) { nonces.set(key, value); }
      };
    }
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput(value) {
      return {
        value,
        mimeType: '',
        setMimeType(mimeType) { this.mimeType = mimeType; return this; }
      };
    }
  },
  Utilities: {
    Charset: { UTF_8: 'UTF-8' },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    getUuid() { return 'synthetic-request-id'; },
    sleep() {},
    computeHmacSha256Signature(value, key) {
      return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
    },
    computeDigest(_algorithm, value) {
      return crypto.createHash('sha256').update(value, 'utf8').digest();
    },
    base64EncodeWebSafe(value) { return toBase64Url(value); }
  },
  UrlFetchApp: {
    fetch(url, options) {
      if (String(url).startsWith('https://chat.googleapis.com/')) {
        chatPosts.push({ url: String(url), body: JSON.parse(options.payload) });
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ name: 'spaces/SYNTHETIC/messages/1' })
        };
      }
      if (fetchMode === 'failure') {
        return { getResponseCode: () => 503, getContentText: () => '{}' };
      }
      const request = JSON.parse(options.payload);
      const system = request.systemInstruction.parts[0].text;
      let modelJson;
      if (system.includes('Map the employee answer')) {
        modelJson = { option_id: 'keep', confidence: 'high', reason: 'clear' };
      } else if (system.includes('announcing completion')) {
        modelJson = { message: '🌻お待たせいたしました！完成しました。' };
      } else if (system.includes('morning')) {
        modelJson = { message: '🌻おはようございます！昨日いただいたエクセル、ここまで仕上げてみました。2つ質問してもいいですか？' };
      } else {
        modelJson = { ok: true, message: '🌻出口APIの承認と接続を確認しました。' };
      }
      const body = {
        candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson) }] } }]
      };
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify(body)
      };
    }
  }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'HimawariExitApi.gs' });

function signedEnvelope(payload, nonce) {
  const timestamp = Date.now();
  const payloadJson = JSON.stringify(payload);
  const signingText = `${timestamp}.${nonce}.${payloadJson}`;
  const signature = crypto
    .createHmac('sha256', properties.get('HIMAWARI_EXIT_API_SECRET'))
    .update(signingText, 'utf8')
    .digest('base64url');
  return { version: 1, timestamp, nonce, payload_json: payloadJson, signature };
}

function callPost(envelope) {
  const output = context.doPost({ postData: { contents: JSON.stringify(envelope) } });
  assert.strictEqual(output.mimeType, 'application/json');
  return JSON.parse(output.value);
}

const healthEnvelope = signedEnvelope({ action: 'health' }, 'nonce_health_000001');
const health = callPost(healthEnvelope);
assert.strictEqual(health.ok, true);
assert.strictEqual(health.result.status, 'ready');
assert.strictEqual(health.result.api_key_configured, true);
assert.strictEqual(health.result.signing_secret_configured, true);
assert.strictEqual(health.result.chat_webhook_configured, true);

const replay = callPost(healthEnvelope);
assert.strictEqual(replay.ok, false);
assert.strictEqual(replay.error.code, 'REPLAY_DETECTED');

const invalidSignature = signedEnvelope({ action: 'health' }, 'nonce_invalid_00001');
invalidSignature.signature = 'wrong-signature';
const invalid = callPost(invalidSignature);
assert.strictEqual(invalid.ok, false);
assert.strictEqual(invalid.error.code, 'INVALID_SIGNATURE');

const morningPayload = {
  action: 'compose_morning',
  job_id: 'JOB-001',
  completed_summary: ['3シートを整理'],
  questions: [
    {
      question_id: 'date_rule',
      question: '日付を画像へ合わせますか？',
      reason: '68件が不一致です。',
      impact: '68行',
      recommended_option_id: 'image',
      options: [
        { option_id: 'image', label: '画像へ合わせる' },
        { option_id: 'excel', label: 'Excelを維持' }
      ]
    },
    {
      question_id: 'duplicate_rule',
      question: '重複をまとめますか？',
      reason: '46件あります。',
      impact: '46行',
      recommended_option_id: 'merge',
      options: [
        { option_id: 'merge', label: 'まとめる' },
        { option_id: 'keep', label: '残す' }
      ]
    }
  ]
};
const morning = callPost(signedEnvelope(morningPayload, 'nonce_morning_00001'));
assert.strictEqual(morning.ok, true);
assert.strictEqual(morning.result.question_count, 2);
assert.strictEqual(morning.result.used_fallback, false);
assert.ok(morning.result.message.startsWith('🌻'));

const deliveryPayload = JSON.parse(JSON.stringify(morningPayload));
deliveryPayload.action = 'deliver_morning';
const delivery = callPost(signedEnvelope(deliveryPayload, 'nonce_delivery_0001'));
assert.strictEqual(delivery.ok, true);
assert.strictEqual(delivery.result.chat_delivery.delivered, true);
assert.strictEqual(delivery.result.chat_delivery.status_code, 200);
assert.strictEqual(chatPosts.length, 1);
assert.ok(chatPosts[0].body.thread.threadKey.startsWith('hx-'));
assert.ok(chatPosts[0].url.includes('messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD'));

const tooMany = JSON.parse(JSON.stringify(morningPayload));
tooMany.questions.push(tooMany.questions[0]);
const rejected = callPost(signedEnvelope(tooMany, 'nonce_questions_0001'));
assert.strictEqual(rejected.ok, false);
assert.strictEqual(rejected.error.code, 'INVALID_QUESTIONS');

const directAnswer = callPost(signedEnvelope({
  action: 'interpret_answer',
  job_id: 'JOB-001',
  question_id: 'duplicate_rule',
  answer: 'まとめる',
  options: [
    { option_id: 'merge', label: 'まとめる' },
    { option_id: 'keep', label: '残す' }
  ]
}, 'nonce_direct_000001'));
assert.strictEqual(directAnswer.ok, true);
assert.strictEqual(directAnswer.result.decision.option_id, 'merge');
assert.strictEqual(directAnswer.result.decision.source, 'exact_match');

fetchMode = 'failure';
const fallback = callPost(signedEnvelope(morningPayload, 'nonce_fallback_0001'));
assert.strictEqual(fallback.ok, true);
assert.strictEqual(fallback.result.used_fallback, true);
assert.ok(fallback.result.message.includes('2つ質問してもいいですか？'));

fetchMode = 'success';
const approval = context.mazukore_dekiguchi_API_wo_shounin();
assert.strictEqual(approval.ok, true);
assert.strictEqual(properties.has('HIMAWARI_EXIT_LAST_TEST_AT'), true);

console.log('11 assertion groups passed');
