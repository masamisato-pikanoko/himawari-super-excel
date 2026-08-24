/**
 * 🌻 Himawari Google Chat HITL return path.
 *
 * Secrets stay in Script Properties. Employee answers are written to the
 * dedicated HITL sheets, and a resumable queue row is created only after all
 * expected questions have one answer each.
 */

var HIMAWARI_HITL_CONFIG_ = {
  spreadsheetId: '11Xh_64ccreR6fsTQuO9oOr_yuQFZipylwyV3yvtRSsQ',
  answerSheet: 'HITL回答',
  queueSheet: '再開キュー',
  allowedSpace: 'spaces/AAQA0mnrSMo',
  serviceAccountEmail: 'himawari-hitl-chat@himawari-excel-hitl-260824.iam.gserviceaccount.com',
  chatScope: 'https://www.googleapis.com/auth/chat.bot',
  tokenCacheKey: 'himawari_chat_app_access_token',
  maxQuestions: 2,
  maxOptions: 3,
  maxTextChars: 1000,
  maxCommentChars: 1000,
  lockWaitMs: 10000
};

/** Google Chat event: app added to a DM or space (current trigger name). */
function onAddedToSpace(event) {
  var space = himawariHitlEventSpace_(event);
  if (space.name && space.name !== HIMAWARI_HITL_CONFIG_.allowedSpace && space.type !== 'DM') {
    return { text: '🌻このアプリは、指定されたHITLスペース専用です。' };
  }
  return {
    text: '🌻準備できました！確認が必要なときだけ、ここへ最大2問お持ちします。'
  };
}

/** Backward-compatible alias for older Chat trigger configurations. */
function onAddToSpace(event) {
  return onAddedToSpace(event);
}

/** Google Chat event: ordinary message or mention. */
function onMessage() {
  return {
    text: '🌻HITL回答は、質問カードの選択肢ボタンからお願いします。'
  };
}

/** Google Chat event: interactive card click. */
function onCardClick(event) {
  var invoked = himawariHitlInvokedFunction_(event);
  if (invoked !== 'himawariHitlRecordAnswer') {
    return { text: '🌻この操作には対応していません。' };
  }
  return himawariHitlRecordAnswer_(event);
}

/** Public callback named by card actions. Keep this wrapper without a trailing underscore. */
function himawariHitlRecordAnswer(event) {
  return himawariHitlRecordAnswer_(event);
}

function himawariHitlRecordAnswer_(event) {
  var params = himawariHitlActionParameters_(event);
  var space = himawariHitlEventSpace_(event);
  var user = himawariHitlEventUser_(event);

  if (space.name !== HIMAWARI_HITL_CONFIG_.allowedSpace) {
    return { text: '🌻このスペースからの回答は受け付けられません。' };
  }

  var jobId = himawariHitlRequiredText_(params.job_id, 'job_id', 160);
  var questionId = himawariHitlRequiredText_(params.question_id, 'question_id', 160);
  var question = himawariHitlCleanText_(params.question, HIMAWARI_HITL_CONFIG_.maxTextChars);
  var optionId = himawariHitlRequiredText_(params.option_id, 'option_id', 160);
  var optionLabel = himawariHitlRequiredText_(params.option_label, 'option_label', 240);
  var comment = himawariHitlCleanText_(
    himawariHitlFormInputText_(event, params.comment_input_name),
    HIMAWARI_HITL_CONFIG_.maxCommentChars
  );
  var expectedQuestions = Math.max(1, Math.min(
    HIMAWARI_HITL_CONFIG_.maxQuestions,
    Number(params.expected_questions) || HIMAWARI_HITL_CONFIG_.maxQuestions
  ));
  var messageName = himawariHitlCleanText_(
    event && event.message && event.message.name,
    300
  );
  var threadName = himawariHitlCleanText_(
    event && event.message && event.message.thread && event.message.thread.name,
    300
  );
  var eventKey = himawariHitlEventKey_(
    jobId,
    questionId,
    user.name || user.email || user.displayName || '',
    messageName
  );

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(HIMAWARI_HITL_CONFIG_.lockWaitMs)) {
    return { text: '🌻ただいま回答が集中しています。数秒後にもう一度お願いします。' };
  }

  try {
    var spreadsheet = SpreadsheetApp.openById(HIMAWARI_HITL_CONFIG_.spreadsheetId);
    var answerSheet = spreadsheet.getSheetByName(HIMAWARI_HITL_CONFIG_.answerSheet);
    var queueSheet = spreadsheet.getSheetByName(HIMAWARI_HITL_CONFIG_.queueSheet);
    if (!answerSheet || !queueSheet) {
      throw new Error('HITL sheets are not configured.');
    }

    var existing = himawariHitlReadAnswers_(answerSheet, jobId);
    var duplicate = existing.filter(function (row) {
      return row.questionId === questionId;
    })[0];
    if (duplicate) {
      return {
        text: '🌻この質問は「' + duplicate.optionLabel + '」で回答済みです。'
      };
    }

    var answerCount = existing.length + 1;
    var readyToResume = answerCount >= expectedQuestions;
    himawariHitlAppendRowAtFirstBlankKey_(answerSheet, 2, [
      new Date(),
      jobId,
      questionId,
      question,
      optionId,
      optionLabel,
      user.email || '',
      user.displayName || '',
      space.name || '',
      threadName,
      messageName,
      eventKey,
      expectedQuestions,
      answerCount,
      readyToResume,
      comment
    ]);

    if (!readyToResume) {
      return {
        text: '🌻1つ目の回答をお預かりしました。あと1つだけお願いします！'
      };
    }

    var allAnswers = existing.concat([{
      questionId: questionId,
      optionId: optionId,
      optionLabel: optionLabel,
      comment: comment
    }]);
    var queued = himawariHitlQueueResume_(
      queueSheet,
      jobId,
      allAnswers,
      space.name || '',
      threadName,
      messageName
    );

    return {
      text: queued
        ? '🌻承知致しました！少々お待ちください。出来上がりしだいお持ちいたしますね。'
        : '🌻回答はすべてお預かり済みです。処理の再開を確認しています。'
    };
  } finally {
    lock.releaseLock();
  }
}

function himawariHitlSendMorning_(composed) {
  var jobId = himawariHitlRequiredText_(composed.job_id, 'job_id', 160);
  var questions = Array.isArray(composed.questions) ? composed.questions.slice(0, 2) : [];
  if (questions.length < 1) {
    throw new Error('One or two HITL questions are required.');
  }

  var sections = [{
    widgets: [{
      textParagraph: {
        text: himawariHitlEscapeHtml_(composed.message || '🌻2つ質問してもいいですか？')
      }
    }]
  }];

  questions.forEach(function (question, index) {
    var options = Array.isArray(question.options)
      ? question.options.slice(0, HIMAWARI_HITL_CONFIG_.maxOptions)
      : [];
    var questionText = himawariHitlCleanText_(question.question, HIMAWARI_HITL_CONFIG_.maxTextChars);
    var commentInputName = 'comment_' + (index + 1);
    var detail = '<b>' + (index + 1) + '．' + himawariHitlEscapeHtml_(questionText) + '</b>';
    if (question.reason) {
      detail += '<br>理由：' + himawariHitlEscapeHtml_(question.reason);
    }
    if (question.impact) {
      detail += '<br>影響：' + himawariHitlEscapeHtml_(question.impact);
    }

    sections.push({
      widgets: [
        { textParagraph: { text: detail } },
        {
          textInput: {
            name: commentInputName,
            label: '任意コメント',
            hintText: '補足があれば入力してください',
            type: 'MULTIPLE_LINE'
          }
        },
        {
          buttonList: {
            buttons: options.map(function (option) {
              var label = himawariHitlCleanText_(option.label, 240);
              var recommended = String(question.recommended_option_id || '') === String(option.option_id || '');
              return {
                text: label + (recommended ? '（推奨）' : ''),
                onClick: {
                  action: {
                    function: 'himawariHitlRecordAnswer',
                    parameters: [
                      { key: 'job_id', value: jobId },
                      { key: 'question_id', value: himawariHitlCleanText_(question.question_id, 160) },
                      { key: 'question', value: questionText },
                      { key: 'option_id', value: himawariHitlCleanText_(option.option_id, 160) },
                      { key: 'option_label', value: label },
                      { key: 'comment_input_name', value: commentInputName },
                      { key: 'expected_questions', value: String(questions.length) }
                    ],
                    loadIndicator: 'SPINNER'
                  }
                }
              };
            })
          }
        }
      ]
    });
  });

  return himawariHitlCreateAppMessage_({
    text: himawariHitlCleanText_(composed.message, 8000),
    cardsV2: [{
      cardId: 'himawari-hitl-' + himawariHitlHash_(jobId).slice(0, 24),
      card: {
        header: {
          title: '🌻 確認をお願いします',
          subtitle: '案件 ' + jobId
        },
        sections: sections
      }
    }]
  }, jobId);
}

function himawariHitlSendComplete_(message, jobId) {
  return himawariHitlCreateAppMessage_({
    text: himawariHitlRequiredText_(message, 'message', 8000)
  }, jobId);
}

function himawariHitlCreateAppMessage_(message, jobId) {
  var accessToken = himawariHitlChatAccessToken_();

  message.thread = {
    threadKey: 'hx-' + himawariHitlHash_(jobId).slice(0, 48)
  };
  var url = 'https://chat.googleapis.com/v1/'
    + HIMAWARI_HITL_CONFIG_.allowedSpace
    + '/messages?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: {
      Authorization: 'Bearer ' + accessToken
    },
    payload: JSON.stringify(message),
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Google Chat app delivery failed with status ' + status + '.');
  }
  var body = JSON.parse(response.getContentText() || '{}');
  return {
    delivered: true,
    channel: 'chat_app',
    status_code: status,
    message_name: body.name || '',
    thread_name: body.thread && body.thread.name ? body.thread.name : '',
    thread_key: message.thread.threadKey
  };
}

function himawariHitlChatAccessToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(HIMAWARI_HITL_CONFIG_.tokenCacheKey);
  if (cached) {
    return cached;
  }

  var url = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'
    + encodeURIComponent(HIMAWARI_HITL_CONFIG_.serviceAccountEmail)
    + ':generateAccessToken';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    },
    payload: JSON.stringify({
      scope: [HIMAWARI_HITL_CONFIG_.chatScope],
      lifetime: '3600s'
    }),
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    var errorText = response.getContentText() || '';
    var errorMessage = '';
    try {
      var errorBody = JSON.parse(errorText || '{}');
      errorMessage = errorBody && errorBody.error && errorBody.error.message
        ? String(errorBody.error.message)
        : '';
    } catch (ignore) {
      errorMessage = '';
    }
    throw new Error(
      'Keyless Chat authentication failed with status ' + status
      + (errorMessage ? ': ' + himawariHitlCleanText_(errorMessage, 500) : '.')
    );
  }
  var body = JSON.parse(response.getContentText() || '{}');
  var token = String(body.accessToken || '');
  if (!token) {
    throw new Error('Keyless Chat authentication returned no access token.');
  }
  cache.put(HIMAWARI_HITL_CONFIG_.tokenCacheKey, token, 3300);
  return token;
}

function himawariHitlReadAnswers_(sheet, jobId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  return sheet.getRange(2, 2, lastRow - 1, 15).getValues()
    .filter(function (row) {
      return String(row[0]) === jobId;
    })
    .map(function (row) {
      return {
        questionId: String(row[1] || ''),
        optionId: String(row[3] || ''),
        optionLabel: String(row[4] || ''),
        comment: String(row[14] || '')
      };
    });
}

function himawariHitlQueueResume_(sheet, jobId, answers, spaceName, threadName, messageName) {
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var queuedJobIds = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    var alreadyQueued = queuedJobIds.some(function (row) {
      return String(row[0]) === jobId;
    });
    if (alreadyQueued) {
      return false;
    }
  }
  himawariHitlAppendRowAtFirstBlankKey_(sheet, 2, [
    new Date(),
    jobId,
    JSON.stringify(answers),
    'pending',
    0,
    '',
    '',
    spaceName,
    threadName,
    messageName
  ]);
  return true;
}

/**
 * Writes to the first row whose business-key cell is blank.
 * This avoids appendRow() jumping below preformatted checkbox/formula rows.
 */
function himawariHitlAppendRowAtFirstBlankKey_(sheet, keyColumn, values) {
  var lastRow = Math.max(sheet.getLastRow(), 2);
  var keyValues = sheet.getRange(2, keyColumn, lastRow - 1, 1).getValues();
  var targetRow = lastRow + 1;
  for (var index = 0; index < keyValues.length; index += 1) {
    if (!String(keyValues[index][0] || '').trim()) {
      targetRow = index + 2;
      break;
    }
  }
  sheet.getRange(targetRow, 1, 1, values.length).setValues([values]);
  return targetRow;
}

function himawariHitlActionParameters_(event) {
  var out = {};
  var common = event && (event.common || event.commonEventObject) || {};
  var parameterObject = common.parameters || {};
  Object.keys(parameterObject).forEach(function (key) {
    out[key] = String(parameterObject[key]);
  });
  var legacy = event && event.action && event.action.parameters || [];
  legacy.forEach(function (item) {
    if (item && item.key) {
      out[String(item.key)] = String(item.value || '');
    }
  });
  return out;
}

function himawariHitlFormInputText_(event, inputName) {
  var name = himawariHitlCleanText_(inputName, 160);
  if (!name) {
    return '';
  }
  var common = event && (event.common || event.commonEventObject) || {};
  var formInputs = common.formInputs || {};
  var input = formInputs[name] || {};
  // Apps Script Chat events wrap input values below an empty-string key,
  // while HTTP Chat apps receive the input object directly.
  input = input[''] || input;
  var values = input.stringInputs && input.stringInputs.value;
  return Array.isArray(values) && values.length ? String(values[0] || '') : '';
}

function himawariHitlInvokedFunction_(event) {
  var common = event && (event.common || event.commonEventObject) || {};
  return String(
    common.invokedFunction
    || (event && event.action && event.action.actionMethodName)
    || ''
  );
}

function himawariHitlEventSpace_(event) {
  var chat = event && event.chat || {};
  return event && event.space || chat.space || {};
}

function himawariHitlEventUser_(event) {
  var chat = event && event.chat || {};
  return event && event.user || chat.user || {};
}

function himawariHitlEventKey_(jobId, questionId, userKey, messageName) {
  return himawariHitlHash_([jobId, questionId, userKey, messageName].join('|'));
}

function himawariHitlHash_(value) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(value),
      Utilities.Charset.UTF_8
    )
  ).replace(/=+$/g, '');
}

function himawariHitlEscapeHtml_(value) {
  return himawariHitlCleanText_(value, 8000)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function himawariHitlRequiredText_(value, fieldName, maxChars) {
  var cleaned = himawariHitlCleanText_(value, maxChars);
  if (!cleaned) {
    throw new Error(fieldName + ' is required.');
  }
  return cleaned;
}

function himawariHitlCleanText_(value, maxChars) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxChars || HIMAWARI_HITL_CONFIG_.maxTextChars);
}

/** Human shelf-label entry: reports readiness without exposing credentials. */
function mazukore_HITL_uketori_junbi_kakunin() {
  var spreadsheet = SpreadsheetApp.openById(HIMAWARI_HITL_CONFIG_.spreadsheetId);
  var result = {
    ok: true,
    authentication_mode: 'iam_credentials_keyless',
    service_account_configured: !!HIMAWARI_HITL_CONFIG_.serviceAccountEmail,
    answer_sheet_ready: !!spreadsheet.getSheetByName(HIMAWARI_HITL_CONFIG_.answerSheet),
    queue_sheet_ready: !!spreadsheet.getSheetByName(HIMAWARI_HITL_CONFIG_.queueSheet),
    allowed_space: HIMAWARI_HITL_CONFIG_.allowedSpace,
    handlers_ready: typeof onAddToSpace === 'function'
      && typeof onMessage === 'function'
      && typeof onCardClick === 'function'
  };
  console.log(JSON.stringify(result));
  return result;
}

/** Human shelf-label entry: opens a fresh IAM-scope consent only when needed. */
function komattara_IAM_scope_wo_sai_shonin() {
  var requiredScope = 'https://www.googleapis.com/auth/iam';
  var authInfo = ScriptApp.getAuthorizationInfo(
    ScriptApp.AuthMode.FULL,
    [requiredScope]
  );
  var status = String(authInfo.getAuthorizationStatus());
  var result = {
    authorization_status: status,
    authorization_url: status === 'REQUIRED' ? authInfo.getAuthorizationUrl() : ''
  };
  console.log(JSON.stringify(result));
  return result;
}

/** Human shelf-label entry: sends a synthetic two-question interactive card. */
function tsugikore_HITL_card_wo_okuru_test() {
  var result = himawariHitlSendMorning_({
    job_id: 'SYNTHETIC-HITL-' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss'),
    message: '🌻おはようございます！昨日いただいたエクセル、ここまで仕上げてみました。2つ質問してもいいですか？',
    questions: [
      {
        question_id: 'date_rule',
        question: '日付が異なる68件は画像の日付へ修正しますか？',
        reason: '画像と台帳の日付が一致しません。',
        impact: '68行',
        recommended_option_id: 'image',
        options: [
          { option_id: 'image', label: '画像の日付へ修正' },
          { option_id: 'excel', label: 'Excelの日付を維持' },
          { option_id: 'hold', label: '保留' }
        ]
      },
      {
        question_id: 'duplicate_rule',
        question: '同一注文番号の46行をまとめますか？',
        reason: '注文番号と金額が一致します。',
        impact: '46行',
        recommended_option_id: 'merge',
        options: [
          { option_id: 'merge', label: 'まとめる' },
          { option_id: 'keep', label: '別明細で残す' },
          { option_id: 'hold', label: '保留' }
        ]
      }
    ]
  });
  console.log(JSON.stringify({
    ok: result.delivered,
    channel: result.channel,
    status_code: result.status_code,
    message_name: result.message_name,
    thread_name: result.thread_name
  }));
  return result;
}

/** Human shelf-label entry: sends the verified A/B development jobs to Google Chat. */
function saigokore_AB_no_HITL_wo_okuru() {
  var commonMessage = '🌻おはようございます！昨日いただいたエクセル、ここまで仕上げてみました。2つ質問してもいいですか？';
  var results = [];
  results.push(himawariHitlSendMorning_({
    job_id: 'A-共有_0823.xlsx-4e78506bb3f2',
    message: commonMessage,
    questions: [
      {
        question_id: 'receipt_precedence',
        question: '証憑と台帳が違う11行は、証憑の日付・金額へ修正しますか？',
        reason: '証憑IDで紐づく画像と、台帳の利用日または合計が一致しません。',
        impact: '11行',
        recommended_option_id: 'receipt',
        options: [
          { option_id: 'receipt', label: '証憑を優先して修正' },
          { option_id: 'ledger', label: '台帳を維持' },
          { option_id: 'hold', label: '保留' }
        ]
      },
      {
        question_id: 'duplicate_images',
        question: '重複・切り抜きと思われる画像は1証憑へまとめますか？',
        reason: '同じ証憑ID・日付・金額の画像と、IDが欠けた切り抜き画像があります。',
        impact: '重複候補画像',
        recommended_option_id: 'group',
        options: [
          { option_id: 'group', label: '1証憑へまとめる' },
          { option_id: 'keep', label: '別画像で残す' },
          { option_id: 'hold', label: '保留' }
        ]
      }
    ]
  }));
  results.push(himawariHitlSendMorning_({
    job_id: 'B-最終版_3.xlsx-0a4a469527af',
    message: commonMessage,
    questions: [
      {
        question_id: 'duplicate_orders',
        question: '複数部門にある同一注文ID 23件は、1注文へ統合しますか？',
        reason: '注文IDは同じですが、日付・顧客・商品・金額が異なるため自動統合は危険です。',
        impact: '50行',
        recommended_option_id: 'keep_separate',
        options: [
          { option_id: 'keep_separate', label: '部門別のまま残す' },
          { option_id: 'merge', label: '1注文へ統合' },
          { option_id: 'hold', label: '保留' }
        ]
      },
      {
        question_id: 'ec_status',
        question: 'ECの返品以外25行は、どの状態で会議集計しますか？',
        reason: 'ECには確定・見込の列がなく、返品以外の分類根拠がありません。',
        impact: '25行',
        recommended_option_id: 'keep_unclassified',
        options: [
          { option_id: 'keep_unclassified', label: '未分類で保留' },
          { option_id: 'confirmed', label: '確定として集計' },
          { option_id: 'forecast', label: '見込として集計' }
        ]
      }
    ]
  }));
  console.log(JSON.stringify(results.map(function (result) {
    return {
      delivered: result.delivered,
      status_code: result.status_code,
      message_name: result.message_name,
      thread_name: result.thread_name
    };
  })));
  return results;
}
