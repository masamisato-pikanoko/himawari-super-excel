# Overnight runbook

## Intake and preliminary output

1. Stage only the authorized development or production inputs. Record source URL/ID when available, file size, and SHA-256.
2. Copy each workbook to `outbox/<job-id>/original/`. Write `uketori.json` with the exact employee response: `🌻お預かりしました。今日も一日お疲れ様でした！`
3. Detect the adapter by workbook topology and semantic headers, never by filename alone.
4. Extract embedded media to a job work directory. Include separately attached images without injecting them into the original workbook.
5. OCR images with Azure Document Intelligence. Store structured OCR beside the job; credentials remain process-only.
6. Apply only safe repairs. Add diagnostic/evidence sheets and `HITL_2問.json`.
7. Verify formula errors, rendered sheets, package-part counts, output hash, and original hash before delivery.
8. The exit API posts the morning card. The program supplies facts/options; the exit model may only phrase them concisely.

## Resume after HITL

1. Require one answer per expected question and use stable `question_id` plus `option_id`.
2. Preserve optional comments verbatim after control-character cleaning.
3. Apply the deterministic branch to the preliminary workbook, never the original.
4. Keep discarded/duplicate evidence physically present unless the user explicitly authorizes deletion; logical grouping is preferred.
5. Add `🌻最終回答`, export a new `*_🌻完成.xlsx`, scan errors, and render every sheet.
6. Post completion only after the output path/hash and QA report exist.

## Blind evaluation

Do not open C/D/E while tuning A/B. When the user starts blind testing, copy one challenge into an isolated job, execute without adapter edits, score objective invariants, then inspect failures. Separate engine defects from unsupported business rules.

## Runtime notes

- Local Windows is the default worker because the bundled spreadsheet runtime is available there. Azure Document Intelligence is the OCR service.
- Azure hosting is optional. Do not promise a container deployment until the spreadsheet runtime/dependencies are reproducible outside Codex.
- For production, supply `HIMAWARI_EXIT_URL` and `HIMAWARI_EXIT_SECRET` through a secret store or process environment. Never commit them.
- If Google OAuth reports `invalid_rapt`, continue all local/Excel verification that is safe, then stop at the exact deployment/delivery step requiring reauthentication.
