-- recompute_scores_regex_fixed.sql
-- Perhitungan ulang skor:
--  - MCMA: full exact set => 1, else 0
--  - PG/TF: first chosen equals any correct => 1, else 0

BEGIN;

ALTER TABLE attempts ADD COLUMN IF NOT EXISTS score numeric;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS max_score integer;

WITH
qcorrect AS (
  SELECT
    q.id AS question_id,
    q.exam_id,
    q.type,
    array_remove(array_agg(o.id) FILTER (WHERE o.is_correct = 1), NULL) AS correct_ids
  FROM questions q
  LEFT JOIN options o ON o.question_id = q.id
  GROUP BY q.id, q.exam_id, q.type
),

answers_norm AS (
  -- normalisasi: ekstrak semua angka dari answer::text jadi int[] terurut
  SELECT
    a.id AS answer_id,
    a.attempt_id,
    a.question_id,
    a.answer::text AS answer_text,
    COALESCE(
      (SELECT array_agg((m[1])::int ORDER BY (m[1])::int)
       FROM regexp_matches(a.answer::text, '(\d+)', 'g') AS m),
      ARRAY[]::int[]
    ) AS chosen_sorted
  FROM answers a
),

expanded AS (
  SELECT
    an.attempt_id,
    an.question_id,
    qc.exam_id,
    qc.type,
    qc.correct_ids,
    an.chosen_sorted
  FROM answers_norm an
  JOIN qcorrect qc ON qc.question_id = an.question_id
),

score_per_attempt AS (
  SELECT
    attempt_id,
    exam_id,
    SUM(
      CASE
        WHEN type = 'mcma' THEN
          CASE WHEN coalesce(correct_ids, ARRAY[]::int[]) = coalesce(chosen_sorted, ARRAY[]::int[]) THEN 1 ELSE 0 END
        ELSE
          CASE
            WHEN array_length(coalesce(chosen_sorted, ARRAY[]::int[]),1) >= 1
              AND ( (coalesce(chosen_sorted, ARRAY[]::int[]))[1] = ANY(coalesce(correct_ids, ARRAY[]::int[])) )
            THEN 1 ELSE 0
          END
      END
    )::numeric AS score
  FROM expanded
  GROUP BY attempt_id, exam_id
),

maxscore AS (
  SELECT exam_id, COUNT(*)::int AS max_score FROM questions GROUP BY exam_id
)

UPDATE attempts a
SET
  score = COALESCE(s.score, 0),
  max_score = m.max_score
FROM score_per_attempt s
LEFT JOIN maxscore m ON m.exam_id = s.exam_id
WHERE a.id = s.attempt_id
  AND a.exam_id = s.exam_id
RETURNING a.id, a.exam_id, a.student_name, a.score, a.max_score;

COMMIT;
