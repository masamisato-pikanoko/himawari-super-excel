# ライブラリの役割

## Core
- Pydantic: JOB/HITL/PROMISE/MorningItem/Feedbackの契約
- Tenacity: 429/503/timeout等のretry
- HTTPX: Weather/News/Transit等のProvider共通HTTP層
- structlog: job_id/promise_id/event_idをログへ通す
- holidays: 祝日・営業日
- google-genai: 出口AIと認識処理だけ

## Test
- pytest: 通常テスト
- Freezegun: 昨日17:30→翌朝8:00を瞬時に再現
- Hypothesis: 状態遷移や変な操作順序を自動生成
- RESPX: HTTPX利用APIを外部接続なしで偽装

## Optional
- FastAPI: Python WorkerをCloud Run Service化する時
- Cloud Tasks: 非同期キュー/重複対策が必要になった時
- Cloud Run Jobs: 大量画像/Excel/PDF/OCR等の夜勤バッチ
