import crypto from "node:crypto";

function base64Url(buffer) {
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export async function callExitApi(payload, {
  url = process.env.HIMAWARI_EXIT_URL,
  secret = process.env.HIMAWARI_EXIT_SECRET,
} = {}) {
  if (!url || !secret) throw new Error("HIMAWARI_EXIT_URL / HIMAWARI_EXIT_SECRET が未設定です。");
  const timestamp = Date.now();
  const nonce = base64Url(crypto.randomBytes(24));
  const payloadJson = JSON.stringify(payload);
  const signature = base64Url(crypto.createHmac("sha256", secret).update(`${timestamp}.${nonce}.${payloadJson}`).digest());
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ version: 1, timestamp, nonce, payload_json: payloadJson, signature }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(`出口API失敗 (${response.status}): ${result?.error?.code || "UNKNOWN"}`);
  return result;
}

export function morningPayload(hitl) {
  return {
    action: "deliver_morning",
    job_id: hitl.job_id,
    employee_name: hitl.employee_name || "",
    completed_summary: hitl.summary ? [hitl.summary] : [],
    questions: hitl.questions,
  };
}
