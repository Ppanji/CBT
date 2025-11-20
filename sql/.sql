# simpan file recompute_mcma.sql di folder saat ini
$sql = @'
WITH qcorrect AS (
  SELECT
    q.id AS question_id,
    q.type,
    array_remove(array_agg(o.id) FILTER (WHERE o.is_correct = 1), NULL) AS correct_ids
  FROM questions q
  LEFT JOIN options o ON o.question_id = q.id
  GROUP BY q.id, q.type
),
expanded AS (
  SELECT
    a.id AS answer_id,
    a.attempt_id,
    a.question_id,
    qc.type,
    qc.correct_ids,
    CASE
      WHEN jsonb_typeof(a.answer::jsonb) = 'array' THEN
        (SELECT array_agg((v)::int ORDER BY (v)::int) FROM jsonb_array_elements_text(a.answer::jsonb) AS v)
      WHEN jsonb_typeof(a.answer::jsonb) = 'number' THEN
        ARRAY[(a.answer::jsonb)::text::int]
      WHEN jsonb_typeof(a.answer::jsonb) = 'string' THEN
        (SELECT array_agg((v)::int ORDER BY (v)::int)
         FROM jsonb_array_elements_text((trim(both '"' FROM a.answer::text))::jsonb) AS v)
      ELSE ARRAY[]::int[]
    END AS chosen_sorted
  FROM answers a
  JOIN qcorrect qc ON qc.question_id = a.question_id
),
score_per_attempt AS (
  SELECT
    attempt_id,
    SUM(
      CASE
        WHEN type = 'mcma' THEN
          CASE WHEN coalesce(correct_ids, ARRAY[]::int[]) = coalesce(chosen_sorted, ARRAY[]::int[]) THEN 1 ELSE 0 END
        ELSE
          CASE WHEN (chosen_sorted IS NOT NULL AND array_length(chosen_sorted,1) >= 1 AND chosen_sorted[1] = ANY(coalesce(correct_ids, ARRAY[]::int[]))) THEN 1 ELSE 0 END
      END
    ) AS score
  FROM expanded
  GROUP BY attempt_id
)
UPDATE attempts a
SET score = s.score
FROM score_per_attempt s
WHERE a.id = s.attempt_id
RETURNING a.id, a.student_name, a.score;
'@

Set-Content -Path .\recompute_mcma.sql -Value $sql -Encoding UTF8
