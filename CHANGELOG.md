# Changelog

## Unreleased

- `INBOX/まさみ試運転`、5分ごとのWindows Worker、GAS試運転メニュー、停止スイッチを追加
- A/B両形式を実ファイルで `WAIT_HITL → 2問回答 → DONE` まで検証し、原本SHA不変・数式エラー0・Drawing保持を確認
- A形式は既存Azure Document Intelligenceの鍵をAzure CLIから実行時取得し、未認証時は `OCR_NOT_CONFIGURED` で安全停止して別AIへフォールバックしない
- 出口APIに継続処理専用のHMAC鍵ID、受付通知、失敗通知を追加し、既存クライアント互換を維持
- Continuity Core Phase 2のDrive原本保全、Worker封筒、実結果取込、同一JOB再開、出口dry-run、安全条件付きトリガーを追加
- SuperExcelのA/B実処理を版付きWorker JSONへ変換し、完成Excel・SHA-256・検品証拠を同じJOBへ回収
- 社員A/B統合試験は2件成功、各2問、数式エラー0。C/D/Eと実Chat送信は未使用
- 添付画像と埋込画像のSHA-256・dHash比較および視覚的重複候補を追加
- Continuity Core Phase 1のGASgraph、同一JOB引継ぎ、翌朝2問HITL、回答後再開を追加
- 固定時刻デモ、Python 19件・GAS 10件の検証、OUTBOXメッセージ、表示調整を追加
- 完成通知へGoogle Driveの「完成Excelを開く」ボタンを追加
- 完成ファイルURLをGoogle Drive / Google Docs URLだけに制限
- 出口API 13 assertion groups、Chat HITL 6 assertion groupsへ検証を拡張

## v0.1.0 - 2026-08-24

- A/Bアダプターと回答後の決定論的な再開処理を実装
- Azure OCR、画像抽出、検品、全シートレンダリングを実装
- Google Chatの2問HITL、任意コメント、Sheets回答記録、再開キューを実装
- 出口APIをGAS本番v9へ反映
- A/Bの実案件カード送信と実画面確認を完了
- Codex Skillを同梱
