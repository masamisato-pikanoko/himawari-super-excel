# 🛒 Codex Handoff Notes

## 先に解決してあること
- 共通データ契約
- 状態遷移ルールの最小案
- idempotency key雛形
- retry policy雛形
- time travel test
- stateful test雛形
- HTTP API mock雛形
- structured logging雛形
- AI renderer隔離口
- Google公式サンプル参照先

## Codexが実装時に確認するもの
1. GASgraphの実シート列
2. Google Chatの実イベントpayload
3. Excel Workerの実返却JSON
4. 本番の認証方式
5. 本番Weather Provider
6. 夜間実行対象JOB
7. HITLカード期限
8. PROMISE回収時刻

## 完了条件
- 同一イベントでWorkerは1回だけ起動
- WAIT_HITLには質問が必ず存在
- DONE/CLOSEDは再実行されない
- 失敗PROMISEも朝に報告
- AI停止時もfallbackで朝便生成
- ユーザーAがユーザーBのJOBをresumeできない
- SheetsからJOB履歴が読める
- Chatで受領→夜→朝→回答→完了が一周する
