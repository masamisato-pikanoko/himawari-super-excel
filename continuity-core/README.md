# スーパー🌻 Continuity Core Phase 1

昨日受け取った一件のExcel仕事を、同じ `JOB_ID` のまま夜間へ渡し、翌朝の2問HITL、回答後の再開、完了、成果物返却まで追跡する初号機です。

## 構成

```text
Google Sheets（GASgraph / 業務状態の正本）
  ├─ JOBS / EVENTS / PROMISES / HITL
  ├─ DELIVERIES / OUTBOX / CONFIG / LOG / ARCHIVE
  └─ Apps Script（状態更新・固定メッセージ・デモWorker）

Python
  ├─ ToolBoxのPydantic契約
  ├─ WAIT_HITL 82% のダミー結果
  └─ DONE 100% のダミー結果
```

AIとGoogle Chat実送信はPhase 1では使用しません。🌻メッセージは固定テンプレートで `OUTBOX` へ保存します。

## 開発用リソース

- Spreadsheet: `https://docs.google.com/spreadsheets/d/1hHZSD4W1Hzu5bCBynyhIU2UH9T6AHWmMmCn8KddKoNw/edit`
- Apps Script ID: `1hXV6pf1YN1kITglTI9yWWex1rxQjyYbvF64lc23tI3Rua_Bte8Ms_q_W`
- タイムゾーン: `Asia/Tokyo`
- デモJOB: `EXCEL_DEMO_001`

## Apps Scriptファイル

- `00_Config.gs`: 定数と正規スキーマ
- `10_Schema.gs`: シート作成と共通行操作
- `20_Clock.gs`: 実時刻・テスト時刻
- `30_EventRepository.gs`: イベントと冪等性
- `40_JobRepository.gs`: JOB状態・版管理
- `50_PromiseRepository.gs`: 翌朝の約束
- `60_HitlRepository.gs`: 2問HITLと回答検証
- `70_OutboxRepository.gs`: メッセージ・成果物出力
- `80_ContinuityService.gs`: 固定メッセージ
- `90_DemoWorker.gs`: GAS側ダミーWorker
- `95_DemoFlow.gs`: 人間向け入口関数
- `98_Presentation.gs`: データを変えずに見た目を整える
- `99_TestRunner.gs`: GASの必須条件テスト

## まさみが押す順番

初回だけ：

1. `mazukore_setupDevGASgraph()`

一工程ずつ確認：

1. `tsugikore_receiveDemoExcel()`
2. `tsugikore_createEveningHandoff()`
3. `tsugikore_runOvernightWorker()`
4. `tsugikore_buildMorningHandoff()`
5. `tsugikore_submitDemoHitlAnswer()`
6. `tsugikore_resumeAndCompleteJob()`
7. `tsugikore_createFeedbackPrompt()`

一度に再現：

1. `mazukore_runFullDemo()`

自動テスト：

1. `saigokore_runContinuityTests()`

見た目だけ再調整：

1. `saigokore_miekata_wo_totonou()`

## Python Worker

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r toolbox\super_himawari_toolbox\requirements-core.txt
.venv\Scripts\python.exe -m pip install -r toolbox\super_himawari_toolbox\requirements-test.txt
.venv\Scripts\python.exe -m pytest

.venv\Scripts\python.exe worker\demo_excel_worker.py --mode wait-hitl
.venv\Scripts\python.exe worker\demo_excel_worker.py --mode done --answers-json worker\demo_answers.json
```

JSONは標準出力と `artifacts/demo_worker_result.json` の両方へ出力され、Pydanticで検証されます。

## 各シート

- `JOBS`: 現在の仕事と状態
- `EVENTS`: 変更の追記履歴
- `PROMISES`: 翌朝返却の約束と回収結果
- `HITL`: 2問、選択肢、本人、回答版
- `DELIVERIES`: 成果物参照
- `OUTBOX`: 🌻が送る予定のメッセージ
- `CONFIG`: `TEST_NOW` と設定
- `LOG`: 実行ログ
- `ARCHIVE`: 将来の退避先（Phase 1はヘッダーのみ）

## 安全境界

- 開発用SpreadsheetのIDと名前が指定された `🌻ひまわりシステム🌻` と一致しない場合は停止します。
- `LockService` 中だけでJOB・EVENT・HITLを更新します。
- 同じ冪等キーを持つイベントは二度作りません。
- `DONE` / `CLOSED` のJOBは再開しません。
- 他ユーザーのJOBにはHITL回答できません。
- HITLは理由・影響・2〜3個の安定した選択肢ID・推奨を持つ2問です。
- 訂正内容は同意を確認するだけで、このPhaseでは保存しません。

## トリガー

Phase 1の動作確認は `TEST_NOW` で時間移動するため、初期状態では時間主導トリガーを作りません。デモとテスト完了後に、実時刻用の入口を追加してから別途設定します。

## 現在の完成範囲

- 同一JOBの受領から完了までのGASgraph
- OUTBOXによる固定メッセージ
- 2問HITLと重複回答防止
- 成功・確認待ち・失敗PROMISEの朝回収
- Python共通契約とダミーWorker
- ローカルおよびGASテスト

## 次回追加候補

- Google Chat実送信
- Calendar
- 予定連動天気
- 実スーパーExcel Worker接続
- App Home
- 出口AI
- 訂正記憶の保存
