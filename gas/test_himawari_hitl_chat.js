'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(
  'C:/Users/sosin/Documents/Codex/2026-08-23/c/work/himawari-exit-api/🌻HITL戻り道.gs',
  'utf8'
);

class MemorySheet {
  constructor(name, headers) {
    this.name = name;
    this.rows = [headers];
  }
  getLastRow() { return this.rows.length; }
  appendRow(row) { this.rows.push(row.slice()); }
  getRange(row, column, numRows, numColumns) {
    return {
      getValues: () => Array.from({ length: numRows }, (_, r) =>
        Array.from({ length: numColumns }, (_, c) => {
          const sourceRow = this.rows[row - 1 + r] || [];
          return sourceRow[column - 1 + c] == null ? '' : sourceRow[column - 1 + c];
        })
      ),
      setValues: (matrix) => {
        matrix.forEach((sourceRow, r) => {
          const targetIndex = row - 1 + r;
          while (this.rows.length <= targetIndex) this.rows.push([]);
          const targetRow = this.rows[targetIndex];
          sourceRow.forEach((value, c) => {
            targetRow[column - 1 + c] = value;
          });
        });
      }
    };
  }
}

const answerSheet = new MemorySheet('HITL回答', Array(16).fill('header'));
const queueSheet = new MemorySheet('再開キュー', Array(10).fill('header'));
const chatRequests = [];
const iamRequests = [];
const cache = new Map();

const context = {
  Array,
  Date,
  Error,
  JSON,
  Math,
  Number,
  Object,
  String,
  console: { log() {}, error() {} },
  CacheService: {
    getScriptCache() {
      return {
        get(name) { return cache.get(name) || null; },
        put(name, value) { cache.set(name, value); }
      };
    }
  },
  ScriptApp: {
    getOAuthToken() { return 'synthetic-user-oauth-token'; }
  },
  SpreadsheetApp: {
    openById() {
      return {
        getSheetByName(name) {
          if (name === 'HITL回答') return answerSheet;
          if (name === '再開キュー') return queueSheet;
          return null;
        }
      };
    }
  },
  LockService: {
    getScriptLock() {
      return { tryLock: () => true, releaseLock() {} };
    }
  },
  UrlFetchApp: {
    fetch(url, options) {
      if (url.includes('iamcredentials.googleapis.com')) {
        iamRequests.push({ url, options, body: JSON.parse(options.payload) });
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ accessToken: 'synthetic-chat-bot-token' })
        };
      }
      chatRequests.push({ url, options, body: JSON.parse(options.payload) });
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          name: 'spaces/AAQA0mnrSMo/messages/SYNTHETIC',
          thread: { name: 'spaces/AAQA0mnrSMo/threads/SYNTHETIC' }
        })
      };
    }
  },
  Utilities: {
    Charset: { UTF_8: 'UTF-8' },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest(_algorithm, value) {
      return crypto.createHash('sha256').update(String(value), 'utf8').digest();
    },
    base64EncodeWebSafe(value) {
      return Buffer.from(value).toString('base64url');
    }
  }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'HimawariHitlChat.gs' });

const readiness = context.mazukore_HITL_uketori_junbi_kakunin();
assert.strictEqual(readiness.ok, true);
assert.strictEqual(readiness.authentication_mode, 'iam_credentials_keyless');
assert.strictEqual(readiness.service_account_configured, true);
assert.strictEqual(readiness.answer_sheet_ready, true);
assert.strictEqual(readiness.queue_sheet_ready, true);
assert.strictEqual(readiness.handlers_ready, true);

const delivery = context.himawariHitlSendMorning_({
  job_id: 'JOB-001',
  message: '🌻2つ質問してもいいですか？',
  questions: [
    {
      question_id: 'q1',
      question: '日付を修正しますか？',
      reason: '不一致です。',
      impact: '68行',
      recommended_option_id: 'yes',
      options: [
        { option_id: 'yes', label: '修正する' },
        { option_id: 'no', label: '維持する' }
      ]
    },
    {
      question_id: 'q2',
      question: '重複をまとめますか？',
      reason: '46件です。',
      impact: '46行',
      recommended_option_id: 'merge',
      options: [
        { option_id: 'merge', label: 'まとめる' },
        { option_id: 'keep', label: '残す' }
      ]
    }
  ]
});
assert.strictEqual(delivery.delivered, true);
assert.strictEqual(delivery.channel, 'chat_app');
assert.strictEqual(iamRequests.length, 1);
assert.strictEqual(chatRequests.length, 1);
assert.strictEqual(chatRequests[0].options.headers.Authorization, 'Bearer synthetic-chat-bot-token');
assert.strictEqual(chatRequests[0].body.cardsV2[0].card.sections.length, 3);
assert.strictEqual(
  chatRequests[0].body.cardsV2[0].card.sections[1].widgets[2].buttonList.buttons[0]
    .onClick.action.function,
  'himawariHitlRecordAnswer'
);
assert.strictEqual(
  chatRequests[0].body.cardsV2[0].card.sections[1].widgets[1].textInput.label,
  '任意コメント'
);

const completeDelivery = context.himawariHitlSendComplete_(
  '🌻完成しました。',
  'JOB-001',
  'https://drive.google.com/file/d/SYNTHETIC/view'
);
assert.strictEqual(completeDelivery.delivered, true);
assert.strictEqual(chatRequests.length, 2);
assert.strictEqual(
  chatRequests[1].body.cardsV2[0].card.sections[0].widgets[0].buttonList.buttons[0].text,
  '完成Excelを開く'
);
assert.strictEqual(
  chatRequests[1].body.cardsV2[0].card.sections[0].widgets[0].buttonList.buttons[0].onClick.openLink.url,
  'https://drive.google.com/file/d/SYNTHETIC/view'
);

function clickEvent(
  questionId,
  optionId,
  optionLabel,
  question,
  spaceName = 'spaces/AAQA0mnrSMo',
  comment = ''
) {
  return {
    common: {
      invokedFunction: 'himawariHitlRecordAnswer',
      parameters: {
        job_id: 'JOB-001',
        question_id: questionId,
        question,
        option_id: optionId,
        option_label: optionLabel,
        comment_input_name: questionId === 'q1' ? 'comment_1' : 'comment_2',
        expected_questions: '2'
      },
      formInputs: {
        [questionId === 'q1' ? 'comment_1' : 'comment_2']: {
          '': { stringInputs: { value: [comment] } }
        }
      }
    },
    space: { name: spaceName, type: 'SPACE' },
    user: {
      name: 'users/123',
      email: 'employee@example.com',
      displayName: 'テスト社員'
    },
    message: {
      name: 'spaces/AAQA0mnrSMo/messages/M1',
      thread: { name: 'spaces/AAQA0mnrSMo/threads/T1' }
    }
  };
}

const first = context.onCardClick(clickEvent(
  'q1',
  'yes',
  '修正する',
  '日付を修正しますか？',
  'spaces/AAQA0mnrSMo',
  '画像で読めない分だけ保留してください。'
));
assert.ok(first.text.includes('あと1つ'));
assert.strictEqual(answerSheet.rows.length, 2);
assert.strictEqual(answerSheet.rows[1][15], '画像で読めない分だけ保留してください。');
assert.strictEqual(queueSheet.rows.length, 1);

const wrapperEvent = clickEvent('q0', 'hold', '保留', '公開ラッパー確認');
wrapperEvent.common.parameters.job_id = 'JOB-WRAPPER';
assert.strictEqual(context.himawariHitlRecordAnswer(wrapperEvent).text.includes('あと1つ'), true);
answerSheet.rows.splice(2, 1);

const second = context.onCardClick(clickEvent('q2', 'merge', 'まとめる', '重複をまとめますか？'));
assert.ok(second.text.includes('承知致しました'));
assert.strictEqual(answerSheet.rows.length, 3);
assert.strictEqual(queueSheet.rows.length, 2);
assert.strictEqual(queueSheet.rows[1][1], 'JOB-001');
assert.strictEqual(queueSheet.rows[1][3], 'pending');
assert.strictEqual(JSON.parse(queueSheet.rows[1][2]).length, 2);
assert.strictEqual(
  JSON.parse(queueSheet.rows[1][2])[0].comment,
  '画像で読めない分だけ保留してください。'
);

const duplicate = context.onCardClick(clickEvent('q2', 'keep', '残す', '重複をまとめますか？'));
assert.ok(duplicate.text.includes('回答済み'));
assert.strictEqual(answerSheet.rows.length, 3);
assert.strictEqual(queueSheet.rows.length, 2);

const wrongSpace = context.onCardClick(clickEvent('q3', 'x', '無効', '無効ですか？', 'spaces/WRONG'));
assert.ok(wrongSpace.text.includes('受け付けられません'));
assert.strictEqual(answerSheet.rows.length, 3);

console.log('6 HITL assertion groups passed');
