# スーパー🌻 Continuity Core

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

Phase 2ではDrive原本の保全、実SuperExcel結果の取込、既存出口APIへの安全な橋渡しまで追加しました。通常の確認ではGoogle Chatへ実送信せず、🌻メッセージを `OUTBOX` に保存します。

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
- `100_Phase2Auth.gs`: Phase 2用のDrive・外部通信・トリガー管理認証
- `105_Phase2Config.gs`: 版付き契約・翌朝時刻・秘密値を出さない共通処理
- `110_DriveIntake.gs`: Drive原本の隔離コピー、SHA-256、JOBフォルダ
- `120_WorkerEnvelope.gs`: SuperExcel Worker結果の厳格検証
- `130_RealFlow.gs`: 朝便、2問回答、同一JOB再開
- `140_ExitBridge.gs`: 既存出口APIへのHMAC橋渡しとdry-run
- `150_Triggers.gs`: 安全条件付き10分トリガー
- `160_ABIntegrationTest.gs`: 社員A/Bだけを使う統合試験棚札
- `170_PilotRuntime.gs`: まさみ専用投入箱、Windows Worker連携、開始・停止メニュー
- `199_Phase2TestRunner.gs`: Phase 2境界条件テスト

## まさみが押す順番

### 実際に試すとき

スプレッドシートを再読み込みすると `🌻試運転` メニューが出ます。

1. `① 試運転の準備`（初回だけ。まだ停止中）
2. `mazukore_dekiguchi_no_koukai_settei_wo_ireru()`（出口URLと鍵IDだけ。秘密値は別途設定）
3. `mazukore_shiunten_no_TEST_NOW_wo_kesu()`（開発用固定時刻を解除）
4. Driveの `INBOX/まさみ試運転` に、1案件1フォルダでExcelと画像を置く
5. `③ 試運転を開始`
6. 急ぐときは `② 今すぐ一周動かす`
7. Google Chatの2問に答え、同じ案件の完成Excelを受け取る
8. 困ったら `困ったら停止`

詳しい初心者向け手順は [../docs/まさみ試運転ガイド.md](../docs/まさみ試運転ガイド.md) を参照してください。

初回だけ：

1. `mazukore_setupDevGASgraph()`

Phase 2の認証を先に済ませる：

1. `mazukore_phase2_no_ninshou()`

この関数はDrive、外部API通信、時間トリガー管理のOAuthを確認します。秘密値はログへ出しません。

Phase 2の開発用受付を作る：

1. `mazukore_phase2_dev_uketsuke_wo_tsukuru()`

社員A/B統合試験の棚札：

1. `mazukore_phase2_shain_AB_wo_test_uketsuke()`
2. SuperExcelが各JOBの `artifacts` へ `worker-update.wait.v1.json` を置く
3. `tsugikore_phase2_shain_AB_no_yakan_kekka_wo_yomu()`
4. `tsugikore_phase2_shain_AB_no_asa_no_2mon_wo_tsukuru()`
5. テストだけなら `tsugikore_phase2_shain_AB_no_test_kaitou_wo_ireru()`
6. SuperExcelが `worker-update.done.v2.json` と完成Excelを置く
7. `saigokore_phase2_shain_AB_no_kansei_kekka_wo_yomu()`

Phase 2自動テスト：

1. `saigokore_phase2_no_test_wo_zenbu_yaru()`

出口の内容だけ確認：

1. `tsugikore_phase2_dekiguchi_no_dry_run()`

実送信と時間トリガーは、`TEST_NOW` を空にし、出口URL・秘密値を設定した後にだけ明示実行します。

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

## トリガーと出口

`saigokore_phase2_10pun_torigaa_wo_tsukuru()` は、`TEST_NOW` が残っている、Drive受付先がない、または出口URL・秘密値がない場合は停止します。作成後は `timetorigaa_phase2_10pun()` が回答キューを回収し、設定済みの出口APIへ送ります。

`saigokore_phase2_OUTBOX_wo_dekiguchi_ni_okuru()` は出口設定がない場合、送信せず `EXIT_API_NOT_CONFIGURED` を返します。

## 現在の完成範囲

- 同一JOBの受領から完了までのGASgraph
- OUTBOXによる固定メッセージ
- 2問HITLと重複回答防止
- 成功・確認待ち・失敗PROMISEの朝回収
- Python共通契約とダミーWorker
- ローカルおよびGASテスト
- Drive原本の隔離保全とSHA-256監査
- SuperExcel A/B実処理との版付きJSON接続
- 完成Excel・検品報告・最終処理報告の同一JOB回収
- 出口APIのdry-runと安全な未設定停止
- Google Drive投入箱、Windows定期Worker、停止スイッチ、同一JOB再開の試運転経路

## 次回追加候補

- Calendar
- 予定連動天気
- App Home
- 訂正記憶の保存
