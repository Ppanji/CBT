-- recompute_mcma.sql
-- Normalisasi jawaban (string/json/number) lalu recompute score: MCMA = full match => 1, else 0

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
      WHEN jsonb_typeof(a.answer::jsonb) = 'array' THEN a.answer::jsonb
      WHEN jsonb_typeof(a.answer::jsonb) = 'number' THEN jsonb_build_array(a.answer::jsonb)
      WHEN jsonb_typeof(a.answer::jsonb) = 'string' THEN (trim(both '"' FROM a.answer::text))::jsonb
      ELSE '[]'::jsonb
    END AS answer_json
  FROM answers a
  JOIN qcorrect qc ON qc.question_id = a.question_id
),
chosen_norm AS (
  SELECT
    answer_id,
    attempt_id,
    question_id,
    type,
    correct_ids,
    (
      SELECT COALESCE(array_agg((v)::int ORDER BY (v)::int), ARRAY[]::int[])
      FROM jsonb_array_elements_text(answer_json) AS v
    ) AS chosen_sorted
  FROM expanded
),
score_per_attempt AS (
  SELECT
    attempt_id,
    SUM(
      CASE
        WHEN type = 'mcma' THEN
          CASE
            WHEN coalesce(correct_ids, ARRAY[]::int[]) = coalesce(chosen_sorted, ARRAY[]::int[]) THEN 1
            ELSE 0
          END
        ELSE
          CASE
            WHEN chosen_sorted IS NOT NULL
                 AND array_length(chosen_sorted,1) >= 1
                 AND chosen_sorted[1] = ANY(coalesce(correct_ids, ARRAY[]::int[]))
            THEN 1 ELSE 0 END
      END
    )::numeric AS score
  FROM chosen_norm
  GROUP BY attempt_id
)
UPDATE attempts a
SET score = s.score
FROM score_per_attempt s
WHERE a.id = s.attempt_id
  AND a.exam_id = 1   -- ganti kalau mau recompute untuk exam lain
RETURNING a.id, a.student_name, a.score;
