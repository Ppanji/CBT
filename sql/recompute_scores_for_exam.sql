-- === CONFIG (pgAdmin version) ===
-- Ganti angka berikut sesuai exam yang ingin dihitung ulang
WITH params AS (
  SELECT 1 AS exam_id   -- <= GANTI angka ini: contoh 1
),

qcorrect AS (
  SELECT q.id AS question_id, q.type, q.exam_id,
         array_remove(array_agg(o.id ORDER BY o.id)
           FILTER (WHERE o.is_correct = 1), NULL) AS correct_ids
  FROM questions q
  LEFT JOIN options o ON o.question_id = q.id
  WHERE q.exam_id = (SELECT exam_id FROM params)
  GROUP BY q.id, q.type, q.exam_id
),

answers_norm AS (
  SELECT a.id AS answer_id, a.attempt_id, a.question_id,
         qc.type, qc.correct_ids, qc.exam_id,
     CASE
       WHEN pg_typeof(a.answer)::text IN ('json','jsonb')
         THEN a.answer::jsonb
       WHEN a.answer::text LIKE '"[%"' OR a.answer::text LIKE '%]"'
         THEN (trim(both '"' FROM a.answer::text))::jsonb
       ELSE a.answer::jsonb
     END AS normalized_json
  FROM answers a
  JOIN qcorrect qc ON qc.question_id = a.question_id
),

answers_chosen AS (
  SELECT answer_id, attempt_id, question_id, type, correct_ids, exam_id,
    CASE
      WHEN jsonb_typeof(normalized_json) = 'array'
        THEN (SELECT array_agg((v)::int ORDER BY (v)::int)
              FROM jsonb_array_elements_text(normalized_json) v)
      WHEN jsonb_typeof(normalized_json) = 'number'
        THEN ARRAY[(normalized_json)::text::int]
      WHEN jsonb_typeof(normalized_json) = 'string'
        THEN (
              CASE
                WHEN trim(both '"' FROM normalized_json::text) ~ '^\[.*\]$'
                  THEN (SELECT array_agg((v)::int ORDER BY (v)::int)
                        FROM jsonb_array_elements_text(
                          (trim(both '"' FROM normalized_json::text))::jsonb
                        ) v)
                ELSE ARRAY[(trim(both '"' FROM normalized_json::text))::int]
              END
        )
      ELSE ARRAY[]::int[]
    END AS chosen_sorted
  FROM answers_norm
),

score_per_answer AS (
  SELECT attempt_id, question_id, exam_id,
    CASE
      WHEN type = 'mcma' THEN
        CASE WHEN coalesce(chosen_sorted, ARRAY[]::int[]) =
                  coalesce(correct_ids, ARRAY[]::int[]) THEN 1 ELSE 0 END
      ELSE
        CASE WHEN array_length(chosen_sorted,1) >= 1
              AND chosen_sorted[1] = ANY(coalesce(correct_ids, ARRAY[]::int[]))
              THEN 1 ELSE 0 END
    END AS expected_score
  FROM answers_chosen
),

score_per_attempt AS (
  SELECT attempt_id, exam_id, SUM(expected_score) AS new_score
  FROM score_per_answer
  GROUP BY attempt_id, exam_id
),

max_per_exam AS (
  SELECT exam_id, COUNT(*) AS max_questions
  FROM questions
  WHERE exam_id = (SELECT exam_id FROM params)
  GROUP BY exam_id
)

-- ===== PREVIEW HASIL =====
SELECT
  sp.attempt_id,
  a.student_name,
  sp.new_score AS computed,
  a.score AS stored,
  m.max_questions
FROM score_per_attempt sp
JOIN attempts a ON a.id = sp.attempt_id
LEFT JOIN max_per_exam m ON m.exam_id = sp.exam_id
ORDER BY sp.attempt_id;

-- ====== UPDATE (HIDUPKAN INI SETELAH PREVIEW BENAR) ======
/*
UPDATE attempts t
SET score = sp.new_score,
    max_score = m.max_questions
FROM score_per_attempt sp
LEFT JOIN max_per_exam m ON m.exam_id = sp.exam_id
WHERE t.id = sp.attempt_id
  AND t.exam_id = (SELECT exam_id FROM params)
RETURNING t.id, t.student_name, t.score, t.max_score;
*/
