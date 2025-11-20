-- sql/normalize_answers.sql
-- * Backup your DB first *
-- 1) Fix answers that are stored as JSON text like: "[21,22]" but wrapped in quotes -> '"[21,22]"'
UPDATE answers
SET answer = trim(both '"' FROM answer::text)::json
WHERE answer::text LIKE '"[%"' OR answer::text LIKE '%]"';

-- 2) For PG/TF questions where answer is an array [x], convert to single JSON number x
UPDATE answers a
SET answer = (a.answer::json -> 0)
FROM questions q
WHERE a.question_id = q.id
  AND q.type IN ('pg','tf')
  AND jsonb_typeof(a.answer::jsonb) = 'array';

-- 3) Ensure MCMA rows have JSON arrays of ints (convert elements to ints)
UPDATE answers a
SET answer = (
  SELECT json_agg((elem::text)::int)
  FROM jsonb_array_elements(a.answer::jsonb) AS t(elem)
)
WHERE a.question_id IN (SELECT id FROM questions WHERE type = 'mcma')
  AND jsonb_typeof(a.answer::jsonb) = 'array';

-- 4) (Optional) For safety, normalize scalar string numbers like '"1"' into 1
UPDATE answers
SET answer = (answer::text)::json
WHERE answer::text ~ '^"[0-9]+';  -- simple heuristic
