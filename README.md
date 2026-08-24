# 🌻 Himawari Super Excel

社員さんから届く、形式の違うExcelと大量画像を夜間に整理し、翌朝は判断が必要な2問だけをGoogle Chatへ届ける仕組みです。

このリポジトリは、まさみさんとCodexが開発履歴を安全に残すための保管庫です。受領したExcel、画像、APIキー、Webhook、実行結果は保存しません。

## まず見る場所

| フォルダ | 中身 |
|---|---|
| `super-excel/` | Excel・画像を処理する本体 |
| `continuity-core/` | 昨日から翌朝へ同じJOBをつなぐGASgraph・2問HITL・デモWorker |
| `gas/` | 出口APIとGoogle Chat HITLの戻り道 |
| `codex-skill/` | Codexが同じ手順を再利用するためのSkill |
| `docs/` | 設計、検品結果、GitHubの見方 |

## 現在の完成地点

- A/B開発ケースを原本非破壊で処理
- A: 36明細・画像16枚・証憑不一致11行を2問へ集約
- B: 4部門130行・重複注文23件・EC未分類25行を2問へ集約
- 数式エラー0、Aの埋込画像12枚、BのDrawingを保持
- A/BそれぞれのGoogle Chatカードに、2問・推奨選択肢・任意コメント欄を実装
- Continuity Core Phase 1で、同一JOBの受領・夜間引継ぎ・翌朝2問・回答後再開・完了を追跡
- GAS本番v9へ反映済み
- C/D/Eは最終ブラインド試験まで未使用

## 夜間処理の流れ

```text
Excel・画像を受領
  → 原本を別保管してSHA-256を記録
  → 構成判定・画像抽出・OCR
  → 安全な修正と検品
  → 整理済みExcel＋判断が必要な2問
  → Google Chatで回答・任意コメント
  → 同じ案件を再開
  → 完成Excel＋最終回答の監査記録
```

Excelの事実、質問、選択肢、回答後の分岐はプログラムが決めます。AIは社員さん向けの短い自然文だけを担当します。

## 人間向け入口

単体処理:

```powershell
node .\super-excel\mazukore_yakan_excel_wo_uketsukeru.mjs --input <xlsx> --ocr <ocr.json> --outdir <結果>
```

5人分の夜間処理:

```powershell
.\super-excel\mazukore_azure_OCR_de_5ninbun.ps1 -Inbox <受取> -Outbox <結果>
```

HITL回答後の仕上げ:

```powershell
node .\super-excel\tsugikore_HITL_kaitou_de_shiageru.mjs --input <整理済.xlsx> --decisions <回答.json> --ocr <ocr.json> --outdir <結果>
```

## 安全ルール

- 原本を上書きしない
- Excel・画像・OCR・回答・完成品を案件ごとに分離する
- APIキー、トークン、Webhook、秘密鍵をGitHubへ保存しない
- 未知形式は推測で壊さず `needs_adapter` で停止する
- 対応案件は必ず2問だけをHITLへ出す
- C/D/Eは最終ブラインド評価が始まるまで開かない

詳しい設計は [docs/設計と検品.md](docs/設計と検品.md)、初心者向け案内は [docs/GitHubの見方.md](docs/GitHubの見方.md) を参照してください。

