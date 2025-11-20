-- sql/recompute_scores_all_exams.sql
-- recompute score for every attempt (all exams)
-- Backup DB before running.

-- create temp table to hold correct options per question
WITH qcorrect AS (
  SELECT q.id AS question_id, q.type,
         array_remove(array_agg(o.id) FILTER (WHERE o.is_correct = 1), NULL) AS correct_ids
  FROM questions q
  LEFT JOIN options o ON o.question_id = q.id
  GROUP BY q.id, q.type
),

-- normalize answers into chosen_sorted (int[]) per answer row
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
         (SELECT array_agg((v)::int ORDER BY (v)::int) FROM jsonb_array_elements_text((trim(both '"' FROM a.answer::text))::jsonb) AS v)
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
          -- full match => 1, else 0
          CASE WHEN coalesce(correct_ids, ARRAY[]::int[]) = coalesce(chosen_sorted, ARRAY[]::int[]) THEN 1 ELSE 0 END
        ELSE
          -- pg / tf: first chosen value matches any correct option => 1 else 0
          CASE WHEN array_length(coalesce(chosen_sorted, ARRAY[]::int[]),1) >= 1
                    AND (coalesce(chosen_sorted, ARRAY[]::int[]))[1] = ANY(coalesce(correct_ids, ARRAY[]::int[]))
               THEN 1 ELSE 0 END
      END
    )::int AS score
  FROM expanded
  GROUP BY attempt_id
)

UPDATE attempts a
SET score = COALESCE(s.score, 0)
FROM score_per_attempt s
WHERE a.id = s.attempt_id;

-- Optionally populate max_score per attempt (number of questions in the exam)
UPDATE attempts a
SET max_score = m.max_q
FROM (
  SELECT e.id AS exam_id, count(q.id)::int AS max_q
  FROM exams e
  JOIN questions q ON q.exam_id = e.id
  GROUP BY e.id
) m
WHERE a.exam_id = m.exam_id;
