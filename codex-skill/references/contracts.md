# Job and HITL contracts

## Preliminary job state

Required fields:

- `job_id`: stable filename/hash identifier.
- `status`: `ready_for_hitl_delivery`, `waiting_hitl`, `needs_adapter`, or `failed`.
- `source_sha256`: received workbook hash.
- `output_path`: preliminary workbook.
- `hitl_path`: two-question payload.
- `question_count`: must equal 2 for a supported job.

## HITL question

Each question has:

- `question_id`: stable semantic identifier.
- `question`: concise business choice.
- `reason`: why automation cannot safely decide.
- `impact`: affected rows/images/files.
- `recommended_option_id`: one supplied option.
- `options`: 2–3 objects with stable `option_id` and user-facing `label`.

The morning greeting is:

`🌻おはようございます！昨日いただいたエクセル、ここまで仕上げてみました。2つ質問してもいいですか？`

After both answers, acknowledge with:

`🌻承知致しました！少々お待ちください。出来上がりしだいお持ちいたしますね。`

## Answer input

The resume worker accepts:

```json
{
  "answers": [
    {
      "question_id": "stable-id",
      "option_id": "stable-option",
      "option_label": "user-facing label",
      "comment": "optional comment"
    }
  ]
}
```

Do not infer a missing second answer. Do not convert a comment into an unlisted option without a new authorized rule.
