/**
 * 🌻 Himawari Exit API
 *
 * Employee-facing AI exists only at the exit boundary. The Excel processor
 * decides facts, links, and at most two HITL questions; Gemini only turns the
 * supplied structured facts into concise Japanese.
 *
 * Required Script Properties:
 *   GEMINI_API_KEY              existing Gemini API key
 *   HIMAWARI_EXIT_API_SECRET    shared signing secret (set before deployment)
 *   HIMAWARI_CHAT_WEBHOOK_URL   Google Chat outgoing webhook URL
 *
 * Human entry functions:
 *   mazukore_dekiguchi_API_wo_shounin()
 *   tsugikore_dekiguchi_API_wo_test()
 *   chatni_todoku_ka_test()
 *   saigokore_dekiguchi_API_no_junbi_wo_kakunin()
 */

var HIMAWARI_EXIT_CONFIG_ = {
  version: 1,
  model: 'gemini-3.6-flash',
  geminiApiProperty: 'GEMINI_API_KEY',
  apiSecretProperty: 'HIMAWARI_EXIT_API_SECRET',
  chatWebhookProperty: 'HIMAWARI_CHAT_WEBHOOK_URL',
  lastTestedProperty: 'HIMAWARI_EXIT_LAST_TEST_AT',
  requestMaxChars: 50000,
  payloadMaxChars: 30000,
  requestClockSkewMs: 5 * 60 * 1000,
  nonceTtlSeconds: 10 * 60,
  maxQuestions: 2,
  maxSummaryItems: 10,
  maxStringChars: 1000,
  maxAnswerChars: 2000
};

/**
 * Public Web App POST entry point.
 *
 * Request body:
 * {
 *   "version": 1,
 *   "timestamp": 1770000000000,
 *   "nonce": "random-unique-value",
 *   "payload_json": "{\"action\":\"health\"}",
 *   "signature": "base64url(HMAC_SHA256(timestamp + '.' + nonce + '.' + payload_json))"
 * }
 */
function doPost(e) {
  var requestId = Utilities.getUuid();

  try {
    var raw = e && e.postData && e.postData.contents
      ? String(e.postData.contents)
      : '';

    if (!raw) {
      throw himawariExitError_('EMPTY_REQUEST', 'Request body is required.');
    }
    if (raw.length > HIMAWARI_EXIT_CONFIG_.requestMaxChars) {
      throw himawariExitError_('REQUEST_TOO_LARGE', 'Request body is too large.');
    }

    var envelope = himawariExitParseJson_(raw, 'INVALID_ENVELOPE');
    var payload = himawariExitAuthenticate_(envelope);
    var result = himawariExitRoute_(payload);

    return himawariExitJsonOutput_({
      ok: true,
      request_id: requestId,
      version: HIMAWARI_EXIT_CONFIG_.version,
      result: result
    });
  } catch (error) {
    var safe = himawariExitSafeError_(error);
    console.error('[HIMAWARI_EXIT] request_id=' + requestId + ' code=' + safe.code);
    return himawariExitJsonOutput_({
      ok: false,
      request_id: requestId,
      version: HIMAWARI_EXIT_CONFIG_.version,
      error: safe
    });
  }
}

function himawariExitRoute_(payload) {
  var action = himawariExitCleanText_(payload && payload.action, 80);

  if (action === 'health') {
    return himawariExitHealth_();
  }
  if (action === 'compose_morning') {
    return himawariExitComposeMorning_(payload);
  }
  if (action === 'deliver_morning') {
    return himawariExitDeliverMorning_(payload);
  }
  if (action === 'compose_complete') {
    return himawariExitComposeComplete_(payload);
  }
  if (action === 'deliver_complete') {
    return himawariExitDeliverComplete_(payload);
  }
  if (action === 'interpret_answer') {
    return himawariExitInterpretAnswer_(payload);
  }

  throw himawariExitError_('UNKNOWN_ACTION', 'Unsupported action.');
}

function himawariExitAuthenticate_(envelope) {
  if (!envelope || Number(envelope.version) !== HIMAWARI_EXIT_CONFIG_.version) {
    throw himawariExitError_('UNSUPPORTED_VERSION', 'Unsupported API version.');
  }

  var timestamp = Number(envelope.timestamp);
  var nonce = String(envelope.nonce || '');
  var payloadJson = String(envelope.payload_json || '');
  var signature = String(envelope.signature || '').replace(/=+$/g, '');

  if (!isFinite(timestamp) || Math.abs(Date.now() - timestamp) > HIMAWARI_EXIT_CONFIG_.requestClockSkewMs) {
    throw himawariExitError_('STALE_REQUEST', 'Request timestamp is outside the allowed window.');
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
    throw himawariExitError_('INVALID_NONCE', 'Nonce is invalid.');
  }
  if (!payloadJson || payloadJson.length > HIMAWARI_EXIT_CONFIG_.payloadMaxChars) {
    throw himawariExitError_('INVALID_PAYLOAD', 'Payload is empty or too large.');
  }
  if (!signature) {
    throw himawariExitError_('MISSING_SIGNATURE', 'Signature is required.');
  }

  var secret = PropertiesService.getScriptProperties()
    .getProperty(HIMAWARI_EXIT_CONFIG_.apiSecretProperty);
  if (!secret) {
    throw himawariExitError_('API_NOT_CONFIGURED', 'Exit API signing secret is not configured.');
  }

  var signingText = timestamp + '.' + nonce + '.' + payloadJson;
  var expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(
      signingText,
      String(secret),
      Utilities.Charset.UTF_8
    )
  ).replace(/=+$/g, '');

  if (!himawariExitTimingSafeEqual_(expected, signature)) {
    throw himawariExitError_('INVALID_SIGNATURE', 'Signature is invalid.');
  }

  var nonceKey = 'hx_nonce_' + himawariExitSha256Base64_(nonce).slice(0, 36);
  var cache = CacheService.getScriptCache();
  if (cache.get(nonceKey)) {
    throw himawariExitError_('REPLAY_DETECTED', 'This request was already used.');
  }
  cache.put(nonceKey, '1', HIMAWARI_EXIT_CONFIG_.nonceTtlSeconds);

  return himawariExitParseJson_(payloadJson, 'INVALID_PAYLOAD_JSON');
}

function himawariExitHealth_() {
  var properties = PropertiesService.getScriptProperties();
  return {
    status: 'ready',
    service: 'himawari-exit-api',
    model: HIMAWARI_EXIT_CONFIG_.model,
    api_key_configured: !!properties.getProperty(HIMAWARI_EXIT_CONFIG_.geminiApiProperty),
    signing_secret_configured: !!properties.getProperty(HIMAWARI_EXIT_CONFIG_.apiSecretProperty),
    chat_webhook_configured: !!properties.getProperty(HIMAWARI_EXIT_CONFIG_.chatWebhookProperty),
    chat_app_configured: himawariExitChatAppConfigured_(),
    checked_at: new Date().toISOString()
  };
}

function himawariExitComposeMorning_(payload) {
  var jobId = himawariExitRequiredText_(payload.job_id, 'job_id', 160);
  var employeeName = himawariExitCleanText_(payload.employee_name || '', 120);
  var summaries = himawariExitCleanStringArray_(
    payload.completed_summary,
    HIMAWARI_EXIT_CONFIG_.maxSummaryItems,
    HIMAWARI_EXIT_CONFIG_.maxStringChars
  );
  var questions = himawariExitValidateQuestions_(payload.questions);

  if (questions.length < 1) {
    throw himawariExitError_('QUESTIONS_REQUIRED', 'compose_morning requires one or two questions.');
  }

  var fallback = himawariExitMorningFallback_(summaries, questions);
  var modelInput = {
    employee_name: employeeName,
    completed_summary: summaries,
    questions: questions.map(function (question) {
      return {
        question_id: question.question_id,
        question: question.question,
        reason: question.reason,
        impact: question.impact,
        recommended_option_id: question.recommended_option_id,
        options: question.options
      };
    })
  };

  var generated = himawariExitTryComposeMessage_(
    'morning_hitl',
    modelInput,
    fallback,
    questions.length
  );

  return {
    action: 'compose_morning',
    job_id: jobId,
    message: generated.message,
    questions: questions,
    question_count: questions.length,
    used_fallback: generated.usedFallback
  };
}

function himawariExitComposeComplete_(payload) {
  var jobId = himawariExitRequiredText_(payload.job_id, 'job_id', 160);
  var employeeName = himawariExitCleanText_(payload.employee_name || '', 120);
  var summaries = himawariExitCleanStringArray_(
    payload.completed_summary,
    HIMAWARI_EXIT_CONFIG_.maxSummaryItems,
    HIMAWARI_EXIT_CONFIG_.maxStringChars
  );
  var outputName = himawariExitCleanText_(payload.output_name || '', 240);
  var outputUrl = himawariExitGoogleDriveUrl_(payload.output_url || '');
  var fallback = '🌻お待たせいたしました！昨日いただいたエクセルが完成しました。成果物をお持ちしました。';

  var generated = himawariExitTryComposeMessage_(
    'complete',
    {
      employee_name: employeeName,
      completed_summary: summaries,
      output_name: outputName,
      output_url: outputUrl
    },
    fallback,
    0
  );

  return {
    action: 'compose_complete',
    job_id: jobId,
    message: generated.message,
    output_name: outputName,
    output_url: outputUrl,
    used_fallback: generated.usedFallback
  };
}

function himawariExitDeliverMorning_(payload) {
  var result = himawariExitComposeMorning_(payload);
  result.action = 'deliver_morning';
  result.chat_delivery = himawariExitDeliverMorningToChat_(result);
  return result;
}

function himawariExitDeliverComplete_(payload) {
  var result = himawariExitComposeComplete_(payload);
  result.action = 'deliver_complete';
  result.chat_delivery = himawariExitDeliverCompleteToChat_(result);
  return result;
}

function himawariExitDeliverMorningToChat_(result) {
  if (himawariExitChatAppConfigured_()) {
    try {
      return himawariHitlSendMorning_(result);
    } catch (error) {
      var fallback = himawariExitPostChat_(result.message, result.job_id);
      fallback.channel = 'webhook_fallback';
      fallback.fallback_reason = 'chat_app_delivery_failed';
      return fallback;
    }
  }
  var delivery = himawariExitPostChat_(result.message, result.job_id);
  delivery.channel = 'webhook';
  return delivery;
}

function himawariExitDeliverCompleteToChat_(result) {
  if (himawariExitChatAppConfigured_()) {
    try {
      return himawariHitlSendComplete_(result.message, result.job_id, result.output_url);
    } catch (error) {
      var fallback = himawariExitPostChat_(result.message, result.job_id, result.output_url);
      fallback.channel = 'webhook_fallback';
      fallback.fallback_reason = 'chat_app_delivery_failed';
      return fallback;
    }
  }
  var delivery = himawariExitPostChat_(result.message, result.job_id, result.output_url);
  delivery.channel = 'webhook';
  return delivery;
}

function himawariExitGoogleDriveUrl_(value) {
  var url = himawariExitCleanText_(value, 2000);
  if (!url) return '';
  if (!/^https:\/\/(?:drive|docs)\.google\.com\//i.test(url)) {
    throw himawariExitError_('INVALID_OUTPUT_URL', 'Output URL must be a Google Drive URL.');
  }
  return url;
}

function himawariExitChatAppConfigured_() {
  return typeof himawariHitlSendMorning_ === 'function'
    && typeof himawariHitlSendComplete_ === 'function'
    && typeof himawariHitlChatAccessToken_ === 'function';
}

function himawariExitPostChat_(message, jobId, outputUrl) {
  var webhookUrl = PropertiesService.getScriptProperties()
    .getProperty(HIMAWARI_EXIT_CONFIG_.chatWebhookProperty);
  if (!webhookUrl) {
    throw himawariExitError_('CHAT_WEBHOOK_NOT_CONFIGURED', 'Google Chat webhook is not configured.');
  }

  var threadKey = 'hx-' + himawariExitSha256Base64_(jobId).slice(0, 48);
  var replyUrl = webhookUrl
    + (webhookUrl.indexOf('?') === -1 ? '?' : '&')
    + 'messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD';
  var chatPayload = {
    text: himawariExitRequiredText_(message, 'message', 8000),
    thread: { threadKey: threadKey }
  };
  var safeOutputUrl = himawariExitGoogleDriveUrl_(outputUrl || '');
  if (safeOutputUrl) {
    chatPayload.cardsV2 = [{
      cardId: 'himawari-complete-' + himawariExitSha256Base64_(jobId).slice(0, 24),
      card: {
        header: {
          title: '🌻 完成しました',
          subtitle: '案件 ' + himawariExitCleanText_(jobId, 160)
        },
        sections: [{
          widgets: [{
            buttonList: {
              buttons: [{
                text: '完成Excelを開く',
                onClick: { openLink: { url: safeOutputUrl } }
              }]
            }
          }]
        }]
      }
    }];
  }
  var response = UrlFetchApp.fetch(replyUrl, {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify(chatPayload),
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw himawariExitError_('CHAT_DELIVERY_FAILED', 'Google Chat delivery failed.');
  }

  return {
    delivered: true,
    thread_key: threadKey,
    status_code: status
  };
}

function himawariExitInterpretAnswer_(payload) {
  var jobId = himawariExitRequiredText_(payload.job_id, 'job_id', 160);
  var questionId = himawariExitRequiredText_(payload.question_id, 'question_id', 160);
  var answer = himawariExitRequiredText_(
    payload.answer,
    'answer',
    HIMAWARI_EXIT_CONFIG_.maxAnswerChars
  );
  var options = himawariExitValidateOptions_(payload.options);
  var normalizedAnswer = himawariExitNormalizeForMatch_(answer);
  var direct = null;

  options.forEach(function (option) {
    if (direct) return;
    if (
      normalizedAnswer === himawariExitNormalizeForMatch_(option.option_id) ||
      normalizedAnswer === himawariExitNormalizeForMatch_(option.label)
    ) {
      direct = option;
    }
  });

  if (direct) {
    return {
      action: 'interpret_answer',
      job_id: jobId,
      question_id: questionId,
      decision: {
        option_id: direct.option_id,
        confidence: 'high',
        needs_clarification: false,
        source: 'exact_match'
      }
    };
  }

  var fallback = {
    option_id: '',
    confidence: 'low',
    needs_clarification: true,
    source: 'fallback'
  };

  try {
    var modelResult = himawariExitCallGeminiJson_(
      'You are the final language adapter for an Excel batch system. ' +
      'Map the employee answer to exactly one supplied option only when the intent is clear. ' +
      'Never invent an option. Return JSON only with option_id, confidence (high, medium, or low), and reason.',
      {
        answer: answer,
        options: options
      }
    );
    var chosenId = himawariExitCleanText_(modelResult.option_id, 160);
    var chosen = options.filter(function (option) {
      return option.option_id === chosenId;
    })[0];
    var confidence = ['high', 'medium', 'low'].indexOf(modelResult.confidence) >= 0
      ? modelResult.confidence
      : 'low';

    if (!chosen || confidence === 'low') {
      return {
        action: 'interpret_answer',
        job_id: jobId,
        question_id: questionId,
        decision: fallback
      };
    }

    return {
      action: 'interpret_answer',
      job_id: jobId,
      question_id: questionId,
      decision: {
        option_id: chosen.option_id,
        confidence: confidence,
        needs_clarification: false,
        source: 'gemini'
      }
    };
  } catch (error) {
    return {
      action: 'interpret_answer',
      job_id: jobId,
      question_id: questionId,
      decision: fallback
    };
  }
}

function himawariExitTryComposeMessage_(kind, modelInput, fallback, questionCount) {
  try {
    var systemText;
    if (kind === 'morning_hitl') {
      systemText =
        'You are 🌻, the final language adapter for an overnight Excel batch system. ' +
        'Write concise, warm, polite Japanese. Use only the supplied facts. ' +
        'Do not change numbers, question count, question meaning, option IDs, or recommendations. ' +
        'Do not add a new question. Do not claim work that is not listed. ' +
        'Begin with a greeting equivalent to: 🌻おはようございます！昨日いただいたエクセル、ここまで仕上げてみました。' +
        questionCount + 'つ質問してもいいですか？ ' +
        'Return JSON only: {"message":"..."}.';
    } else {
      systemText =
        'You are 🌻, the final language adapter for an overnight Excel batch system. ' +
        'Write one or two concise, warm, polite Japanese sentences announcing completion. ' +
        'Use only the supplied facts. Do not invent results, numbers, or links. ' +
        'Return JSON only: {"message":"..."}.';
    }

    var modelResult = himawariExitCallGeminiJson_(systemText, modelInput);
    var message = himawariExitCleanText_(modelResult.message, 3000);
    if (!message || message.indexOf('🌻') !== 0) {
      throw himawariExitError_('INVALID_MODEL_MESSAGE', 'Model message did not pass validation.');
    }
    return { message: message, usedFallback: false };
  } catch (error) {
    return { message: fallback, usedFallback: true };
  }
}

function himawariExitCallGeminiJson_(systemText, inputObject) {
  var apiKey = PropertiesService.getScriptProperties()
    .getProperty(HIMAWARI_EXIT_CONFIG_.geminiApiProperty);
  if (!apiKey) {
    throw himawariExitError_('GEMINI_NOT_CONFIGURED', 'Gemini API key is not configured.');
  }

  var url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(HIMAWARI_EXIT_CONFIG_.model) +
    ':generateContent';
  var requestBody = {
    systemInstruction: {
      parts: [{ text: String(systemText) }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: JSON.stringify(inputObject) }]
      }
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 768,
      responseMimeType: 'application/json'
    }
  };
  var retryDelays = [0, 700, 1800];
  var lastCode = 0;

  for (var attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt]) {
      Utilities.sleep(retryDelays[attempt]);
    }

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': String(apiKey).trim() },
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    });
    lastCode = response.getResponseCode();

    if (lastCode >= 200 && lastCode < 300) {
      var responseJson = himawariExitParseJson_(
        response.getContentText(),
        'INVALID_GEMINI_RESPONSE'
      );
      var text = himawariExitExtractGeminiText_(responseJson);
      return himawariExitParseModelJson_(text);
    }

    if (lastCode !== 429 && lastCode < 500) {
      break;
    }
  }

  throw himawariExitError_(
    'GEMINI_REQUEST_FAILED',
    'Gemini request failed with status ' + lastCode + '.'
  );
}

function himawariExitExtractGeminiText_(json) {
  var candidate = json && json.candidates && json.candidates[0];
  var parts = candidate && candidate.content && candidate.content.parts;
  var text = parts && parts[0] && parts[0].text;
  if (!text) {
    throw himawariExitError_('EMPTY_GEMINI_RESPONSE', 'Gemini returned no text.');
  }
  return String(text);
}

function himawariExitParseModelJson_(text) {
  var cleaned = String(text || '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    var firstBrace = cleaned.indexOf('{');
    var lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return himawariExitParseJson_(
        cleaned.slice(firstBrace, lastBrace + 1),
        'INVALID_MODEL_JSON'
      );
    }
    throw himawariExitError_('INVALID_MODEL_JSON', 'Model did not return valid JSON.');
  }
}

function himawariExitMorningFallback_(summaries, questions) {
  var message =
    '🌻おはようございます！昨日いただいたエクセル、ここまで仕上げてみました。' +
    questions.length +
    'つ質問してもいいですか？';

  if (summaries.length) {
    message += '\n\nここまでの作業：' + summaries.join('／');
  }

  questions.forEach(function (question, index) {
    message += '\n\n' + (index + 1) + '．' + question.question;
    if (question.reason) message += '\n理由：' + question.reason;
    if (question.impact) message += '\n影響：' + question.impact;
    message += '\n選択肢：' + question.options.map(function (option) {
      return option.label;
    }).join('／');
  });

  return message;
}

function himawariExitValidateQuestions_(rawQuestions) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length > HIMAWARI_EXIT_CONFIG_.maxQuestions) {
    throw himawariExitError_('INVALID_QUESTIONS', 'Questions must contain at most two items.');
  }

  return rawQuestions.map(function (raw) {
    var options = himawariExitValidateOptions_(raw && raw.options);
    var recommendedId = himawariExitCleanText_(raw && raw.recommended_option_id, 160);
    if (recommendedId && !options.some(function (option) {
      return option.option_id === recommendedId;
    })) {
      throw himawariExitError_('INVALID_RECOMMENDATION', 'Recommended option is not in options.');
    }

    return {
      question_id: himawariExitRequiredText_(raw && raw.question_id, 'question_id', 160),
      question: himawariExitRequiredText_(raw && raw.question, 'question', 1000),
      reason: himawariExitCleanText_(raw && raw.reason, 1000),
      impact: himawariExitCleanText_(raw && raw.impact, 1000),
      recommended_option_id: recommendedId,
      options: options
    };
  });
}

function himawariExitValidateOptions_(rawOptions) {
  if (!Array.isArray(rawOptions) || rawOptions.length < 2 || rawOptions.length > 5) {
    throw himawariExitError_('INVALID_OPTIONS', 'Each question requires two to five options.');
  }

  var seen = {};
  return rawOptions.map(function (raw) {
    var optionId = himawariExitRequiredText_(raw && raw.option_id, 'option_id', 160);
    if (seen[optionId]) {
      throw himawariExitError_('DUPLICATE_OPTION', 'Option IDs must be unique.');
    }
    seen[optionId] = true;
    return {
      option_id: optionId,
      label: himawariExitRequiredText_(raw && raw.label, 'option label', 500)
    };
  });
}

function himawariExitCleanStringArray_(value, maxItems, maxChars) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map(function (item) {
    return himawariExitCleanText_(item, maxChars);
  }).filter(function (item) {
    return !!item;
  });
}

function himawariExitRequiredText_(value, fieldName, maxChars) {
  var text = himawariExitCleanText_(value, maxChars);
  if (!text) {
    throw himawariExitError_('MISSING_FIELD', fieldName + ' is required.');
  }
  return text;
}

function himawariExitCleanText_(value, maxChars) {
  var text = String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  return text.slice(0, maxChars || HIMAWARI_EXIT_CONFIG_.maxStringChars);
}

function himawariExitNormalizeForMatch_(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　。、,.!！?？「」『』()（）\-_]/g, '');
}

function himawariExitParseJson_(text, code) {
  try {
    return JSON.parse(String(text));
  } catch (error) {
    throw himawariExitError_(code || 'INVALID_JSON', 'Invalid JSON.');
  }
}

function himawariExitJsonOutput_(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

function himawariExitError_(code, message) {
  var error = new Error(message || code);
  error.himawariCode = code;
  return error;
}

function himawariExitSafeError_(error) {
  var code = error && error.himawariCode
    ? String(error.himawariCode)
    : 'INTERNAL_ERROR';
  var publicMessages = {
    EMPTY_REQUEST: 'Request body is required.',
    REQUEST_TOO_LARGE: 'Request body is too large.',
    INVALID_ENVELOPE: 'Request envelope is invalid.',
    UNSUPPORTED_VERSION: 'API version is unsupported.',
    STALE_REQUEST: 'Request timestamp is outside the allowed window.',
    INVALID_NONCE: 'Request nonce is invalid.',
    INVALID_PAYLOAD: 'Request payload is invalid.',
    INVALID_PAYLOAD_JSON: 'Request payload is invalid.',
    MISSING_SIGNATURE: 'Request signature is required.',
    INVALID_SIGNATURE: 'Request authentication failed.',
    REPLAY_DETECTED: 'Request was already used.',
    API_NOT_CONFIGURED: 'Exit API is not configured.',
    CHAT_WEBHOOK_NOT_CONFIGURED: 'Google Chat delivery is not configured.',
    CHAT_DELIVERY_FAILED: 'Google Chat delivery failed.',
    UNKNOWN_ACTION: 'Requested action is unsupported.',
    QUESTIONS_REQUIRED: 'One or two HITL questions are required.',
    INVALID_QUESTIONS: 'HITL questions are invalid.',
    INVALID_OPTIONS: 'HITL options are invalid.',
    INVALID_RECOMMENDATION: 'Recommended option is invalid.',
    DUPLICATE_OPTION: 'HITL option IDs must be unique.',
    MISSING_FIELD: 'A required field is missing.'
  };

  return {
    code: code,
    message: publicMessages[code] || 'The request could not be completed.'
  };
}

function himawariExitTimingSafeEqual_(left, right) {
  left = String(left || '');
  right = String(right || '');
  var difference = left.length ^ right.length;
  var maxLength = Math.max(left.length, right.length);
  for (var index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function himawariExitSha256Base64_(value) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(value),
      Utilities.Charset.UTF_8
    )
  ).replace(/=+$/g, '');
}

/**
 * First human-run entry. This intentionally sends only a harmless synthetic
 * prompt and never reads or logs the API key.
 */
function mazukore_dekiguchi_API_wo_shounin() {
  var result = himawariExitCallGeminiJson_(
    'Return JSON only with {"ok":true,"message":"🌻出口APIの承認と接続を確認しました。"}.',
    { synthetic_test: true }
  );

  if (!result || result.ok !== true) {
    throw new Error('出口APIのテスト応答を確認できませんでした。');
  }

  PropertiesService.getScriptProperties().setProperty(
    HIMAWARI_EXIT_CONFIG_.lastTestedProperty,
    new Date().toISOString()
  );
  var safeResult = {
    ok: true,
    model: HIMAWARI_EXIT_CONFIG_.model,
    message: himawariExitCleanText_(result.message, 500)
  };
  console.log(JSON.stringify(safeResult));
  return safeResult;
}

/** Second human-run entry. Builds a morning message from synthetic facts. */
function tsugikore_dekiguchi_API_wo_test() {
  var result = himawariExitComposeMorning_({
    action: 'compose_morning',
    job_id: 'SYNTHETIC-TEST-001',
    employee_name: 'テスト担当者',
    completed_summary: [
      '3シートを整理しました',
      '画像184枚をExcelの行へ対応付けました'
    ],
    questions: [
      {
        question_id: 'date_rule',
        question: 'Excelと画像で日付が異なる68件は、画像の日付へ修正しますか？',
        reason: '画像の記載日と台帳の日付が一致しません。',
        impact: '3シート・68行',
        recommended_option_id: 'use_image_date',
        options: [
          { option_id: 'use_image_date', label: '画像の日付へ修正' },
          { option_id: 'keep_excel_date', label: 'Excelの日付を維持' },
          { option_id: 'hold', label: '今回は保留' }
        ]
      },
      {
        question_id: 'duplicate_rule',
        question: '同一注文番号の46行を重複としてまとめますか？',
        reason: '注文番号と金額が一致する行が複数あります。',
        impact: '46行・合計金額は変更しません',
        recommended_option_id: 'merge',
        options: [
          { option_id: 'merge', label: 'まとめる' },
          { option_id: 'keep', label: '別明細として残す' },
          { option_id: 'hold', label: '該当行だけ確認' }
        ]
      }
    ]
  });
  console.log(JSON.stringify({
    ok: true,
    question_count: result.question_count,
    used_fallback: result.used_fallback,
    message: result.message
  }));
  return result;
}

/** Sends one harmless synthetic connection message to the configured Chat space. */
function chatni_todoku_ka_test() {
  var delivery = himawariExitPostChat_(
    '🌻接続テストです。絶望エクセルのHITL通知を、このスペースへお届けできるようになりました！',
    'HIMAWARI-CHAT-CONNECTION-TEST'
  );
  var safeResult = {
    ok: delivery.delivered === true,
    status_code: delivery.status_code,
    thread_key: delivery.thread_key
  };
  console.log(JSON.stringify(safeResult));
  return safeResult;
}

/** Final human-run entry. Reports configuration state without exposing values. */
function saigokore_dekiguchi_API_no_junbi_wo_kakunin() {
  var properties = PropertiesService.getScriptProperties();
  var result = {
    ok: true,
    model: HIMAWARI_EXIT_CONFIG_.model,
    gemini_api_key_configured: !!properties.getProperty(HIMAWARI_EXIT_CONFIG_.geminiApiProperty),
    signing_secret_configured: !!properties.getProperty(HIMAWARI_EXIT_CONFIG_.apiSecretProperty),
    chat_webhook_configured: !!properties.getProperty(HIMAWARI_EXIT_CONFIG_.chatWebhookProperty),
    chat_app_configured: himawariExitChatAppConfigured_(),
    last_tested_at: properties.getProperty(HIMAWARI_EXIT_CONFIG_.lastTestedProperty) || '',
    do_post_ready: typeof doPost === 'function'
  };
  console.log(JSON.stringify(result));
  return result;
}
