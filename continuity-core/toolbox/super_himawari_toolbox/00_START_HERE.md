# 🛒 START HERE

## 最優先ルール

- **GASgraph / Sheets が業務状態の正本**
- Python Worker は状態を決定せず、処理結果を `JobUpdate` として返す
- 同一 `event_id` / `idempotency_key` で二重実行しない
- `DONE` / `CLOSED` のJOBを再実行しない
- HITL回答はユーザー・JOB・質問ID・回答版を紐づけて検証
- AIが落ちても朝便とHITLは通常テンプレートで動作継続
- `promise` は成功時だけでなく、失敗・確認待ちも翌朝に回収する
- 状態変更時は契約とテストを同時更新

## 実装順

P0 contracts + tests
P1 Chat shell
P2 GASgraph adapter
P3 evening promise
P4 overnight worker
P5 HITL resume
P6 delivery
P7 feedback memory
P8 calendar + weather
P9 AI renderer
P10 rich modules

## テスト

```bash
python -m compileall src tests
pytest -q
```
