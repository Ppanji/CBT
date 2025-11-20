CREATE TABLE IF NOT EXISTS exams (
  id serial PRIMARY KEY,
  title varchar(255) NOT NULL,
  description text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id serial PRIMARY KEY,
  exam_id integer NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  text text NOT NULL,
  type varchar(50) NOT NULL DEFAULT 'pg',
  extra json
);

CREATE TABLE IF NOT EXISTS options (
  id serial PRIMARY KEY,
  question_id integer NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text text NOT NULL,
  is_correct integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attempts (
  id serial PRIMARY KEY,
  exam_id integer NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_name varchar(255),
  started_at timestamptz DEFAULT now() NOT NULL,
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS answers (
  id serial PRIMARY KEY,
  attempt_id integer NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id integer NOT NULL REFERENCES questions(id),
  answer json
);
