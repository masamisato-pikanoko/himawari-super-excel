# 🌻 Super Himawari Toolbox for Codex

スーパー🌻の実装探索時間を減らすための、Codex向けツールボックスです。

## 設計前提

- 状態の正本は **GASgraph / Google Sheets**
- Python側は **Worker / API接続 / 検証 / テスト**
- AIは **入口・出口、または画像解析・分類など認識が必要な場所**
- HITLは **WAIT_HITL → RESPONSE_RECEIVED → RESUME → DONE**
- 「昨日から今日へ」の継続は **同じ JOB_ID / PROMISE_ID / EVENT_ID** で追跡
- 失敗時も、約束した結果は朝に必ず回収する
- ユーザーに見える状態はできるだけ Sheets / Chat に残す

## 最初に見る順番

1. `00_START_HERE.md`
2. `requirements-core.txt`
3. `src/contracts/`
4. `src/resilience/`
5. `tests/scenarios/`
6. `docs/GOOGLE_OFFICIAL_PARTS.md`
7. `docs/CODEX_HANDOFF.md`

## 初号機の完成ライン

Excel受領 → GASgraph RECEIVED → 夕方PROMISE → 夜間Worker → WAIT_HITL → 朝のChatカード → 回答 → RESUME → 完了ファイル返却 → 訂正記憶の許可確認

Calendar / Weather / Drive / Gmail / Meet は、その後にモジュールとして足します。
