-- recompute_mcma_fixed.sql
-- Catatan: default akan recompute untuk exam_id = 1.
-- GANTI nilai di bawah jika ingin recompute untuk exam lain.

\echo '=== recompute_mcma_fixed.sql starting ==='

-- Ubah nomor ini jika mau recompute untuk exam lain
\set EXAM_ID 1

-- (Preview) list attempts for the exam before recompute
SELECT id, exam_id, student_name, started_at, finished_at, score, max_score
FROM attempts
WHERE exam_id = :EXAM_ID
ORDER BY id DESC
LIMIT 30;

-- OPTIONAL: preview answers that look like strings " [ ... ] "
SELECT id, attempt_id, question_id, answer::text AS answer_text, pg_typeof(answer) AS typ, octet_length(answer::text) as len
FROM answers
WHERE (answer::text LIKE '"[%"' OR answer::text LIKE '%]"')
  AND EXISTS (SELECT 1 FROM attempts at WHERE at.id = answers.attempt_id AND at.exam_id = :EXAM_ID)
ORDER BY id;

-- MAIN: recompute scores for attempts of the given exam
WITH
qcorrect AS (
  -- collect correct option ids per question
  SELECT
    q.id AS question_id,
    q.type,
    array_remove(array_agg(o.id ORDER BY o.id) FILTER (WHERE o.is_correct = 1), NULL) AS correct_ids
  FROM questions q
  LEFT JOIN options o ON o.question_id = q.id
  WHERE q.exam_id = :EXAM_ID
  GROUP BY q.id, q.type
),

answers_norm AS (
  -- normalize answer column to integer arrays (sorted) where possible
  SELECT
    a.id AS answer_id,
    a.attempt_id,
    a.question_id,
    CASE
      -- case: stored as JSON array
      WHEN jsonb_typeof(a.answer::jsonb) = 'array' THEN
        (SELECT array_agg((v)::int ORDER BY (v)::int) FROM jsonb_array_elements_text(a.answer::jsonb) AS v)
      -- case: stored as single number
      WHEN jsonb_typeof(a.answer::jsonb) = 'number' THEN
        ARRAY[(a.answer::jsonb)::text::int]
      -- case: stored as JSON string containing an array like "[21,22]" (trim quotes then parse)
      WHEN (a.answer::text LIKE '"[%"' OR a.answer::text LIKE '%]"') THEN
        (CASE
          WHEN (trim(both '"' FROM a.answer::text)) ~ '^\s*\[.*\]\s*$' THEN
            (SELECT array_agg((v)::int ORDER BY (v)::int)
             FROM jsonb_array_elements_text((trim(both '"' FROM a.answer::text))::jsonb) AS v)
          ELSE NULL
         END)
      ELSE NULL
    END AS chosen_sorted
  FROM answers a
  JOIN attempts at ON at.id = a.attempt_id
  WHERE at.exam_id = :EXAM_ID
),

score_per_attempt AS (
  -- compute score per attempt using the rules:
  -- MCMA: full match => 1, else 0
  -- PG/TF: first chosen matches any correct => 1, else 0
  SELECT
    an.attempt_id,
    SUM(
      CASE
        WHEN qc.type = 'mcma' THEN
          CASE WHEN coalesce(qc.correct_ids, ARRAY[]::int[]) = coalesce(an.chosen_sorted, ARRAY[]::int[]) THEN 1 ELSE 0 END
        ELSE
          CASE WHEN an.chosen_sorted IS NOT NULL
                    AND array_length(an.chosen_sorted,1) >= 1
                    AND an.chosen_sorted[1] = ANY(coalesce(qc.correct_ids, ARRAY[]::int[]))
               THEN 1 ELSE 0 END
      END
    ) AS score
  FROM answers_norm an
  JOIN qcorrect qc ON qc.question_id = an.question_id
  GROUP BY an.attempt_id
)

-- Update attempts.score for that exam
UPDATE attempts a
SET score = coalesce(s.score, 0)
FROM score_per_attempt s
WHERE a.id = s.attempt_id
  AND a.exam_id = :EXAM_ID
RETURNING a.id, a.student_name, a.score;

-- also update max_score for attempts (optional) if you want attempts.max_score to reflect total questions
-- (will set same max_score for every attempt of the exam)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='attempts' AND column_name='max_score') THEN
    EXECUTE format('UPDATE attempts SET max_score = (SELECT count(*) FROM questions WHERE exam_id = %s) WHERE exam_id = %s', :EXAM_ID, :EXAM_ID);
    RAISE NOTICE 'Updated attempts.max_score for exam %', :EXAM_ID;
  ELSE
    RAISE NOTICE 'Column attempts.max_score does not exist — skipping max_score update';
  END IF;
END$$;

\echo '=== recompute_mcma_fixed.sql finished ==='
