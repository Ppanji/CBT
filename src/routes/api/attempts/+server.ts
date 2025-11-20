// src/routes/api/attempts/+server.ts
import type { RequestHandler } from '@sveltejs/kit';

async function getSql() {
  const { default: postgres } = await import('postgres');
  const conn = process.env.DATABASE_URL || 'postgresql://postgres:4312@localhost:5432/cbt_local';
  return postgres(conn, { transform: { column: 'camel' } });
}

export const POST: RequestHandler = async ({ request }) => {
  const sql = await getSql();
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      await sql.end().catch(() => {});
      return new Response(JSON.stringify({ message: 'Empty request body' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    const exam_id = Number(body.exam_id);
    const student_name = body.student_name ?? null;
    // optional timestamps (we'll let DB default when not provided)
    const started_at = body.started_at ?? null;
    const finished_at = body.finished_at ?? null;
    const answers = Array.isArray(body.answers) ? body.answers : [];

    if (!exam_id) {
      await sql.end().catch(() => {});
      return new Response(JSON.stringify({ message: 'Invalid exam_id' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    const out = await sql.begin(async (tx) => {
      // create attempt row; let DB set default timestamps if not given
      let attemptRow;
      if (started_at && finished_at) {
        attemptRow = await tx`
          INSERT INTO attempts (exam_id, student_name, started_at, finished_at)
          VALUES (${exam_id}, ${student_name}, ${started_at}, ${finished_at})
          RETURNING id, started_at, finished_at
        `;
      } else if (started_at && !finished_at) {
        attemptRow = await tx`
          INSERT INTO attempts (exam_id, student_name, started_at)
          VALUES (${exam_id}, ${student_name}, ${started_at})
          RETURNING id, started_at, finished_at
        `;
      } else if (!started_at && finished_at) {
        attemptRow = await tx`
          INSERT INTO attempts (exam_id, student_name, finished_at)
          VALUES (${exam_id}, ${student_name}, ${finished_at})
          RETURNING id, started_at, finished_at
        `;
      } else {
        attemptRow = await tx`
          INSERT INTO attempts (exam_id, student_name)
          VALUES (${exam_id}, ${student_name})
          RETURNING id, started_at, finished_at
        `;
      }

      if (!Array.isArray(attemptRow) || attemptRow.length === 0) {
        throw new Error('Failed to create attempt');
      }
      const attempt = attemptRow[0];

      // load question types + correct option ids for exam
      const qRows = await tx`
        SELECT q.id, q.type,
               COALESCE(array_agg(o.id) FILTER (WHERE o.is_correct = 1), ARRAY[]::int[]) AS correct_option_ids
        FROM questions q
        LEFT JOIN options o ON o.question_id = q.id
        WHERE q.exam_id = ${exam_id}
        GROUP BY q.id, q.type
      `;

      const questionMap = new Map<number, { type: string, correctOpts: number[] }>();
      for (const r of qRows) {
        const qid = Number(r.id);
        const type = (r.type ?? 'pg').toString();
        const opts = Array.isArray(r.correct_option_ids) ? r.correct_option_ids.map((n:any)=>Number(n)) : [];
        questionMap.set(qid, { type, correctOpts: opts });
      }

      // insert answers and compute score
      let score = 0;
      const max_score = questionMap.size;

      for (const a of answers) {
        const qid = Number(a.question_id);
        if (!qid) continue;

        // raw answer payload may be number, string, array, or stringified array.
        let raw = a.answer;
        // normalize `raw` to JS value(s)
        // if string that looks like JSON, try parse
        if (typeof raw === 'string') {
          const s = raw.trim();
          // common case: '"[21,22]"' or '[21,22]' or '"1"'
          if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('"[') && s.endsWith(']"')) || s.startsWith('{') || s.startsWith('"')) {
            try {
              raw = JSON.parse(s);
            } catch (err) {
              // fallback: keep as string
            }
          } else if (!isNaN(Number(s))) {
            raw = Number(s);
          }
        }

        const qinfo = questionMap.get(qid);
        // persist normalized answer in DB:
        let normalizedForDb: any = null;
        if (qinfo && qinfo.type === 'mcma') {
          // mcma expects array of option ids (ints)
          if (Array.isArray(raw)) {
            normalizedForDb = raw.map((v: any) => Number(v)).filter((v: number) => !isNaN(v));
          } else if (raw == null) {
            normalizedForDb = [];
          } else {
            // single value -> make single-element array
            const n = Number(raw);
            normalizedForDb = !isNaN(n) ? [n] : [];
          }
        } else {
          // pg / tf / default -> store single number (first element if array)
          if (Array.isArray(raw)) {
            const first = raw.length ? raw[0] : null;
            normalizedForDb = (first == null) ? null : Number(first);
          } else {
            const n = Number(raw);
            normalizedForDb = isNaN(n) ? null : n;
          }
        }

        // Insert answer as proper JSON/number (don't stringify)
        // pass normalizedForDb directly so postgres lib serializes correctly
        await tx`
          INSERT INTO answers (attempt_id, question_id, answer)
          VALUES (${attempt.id}, ${qid}, ${normalizedForDb})
        `;

        // scoring
        if (!qinfo) continue;
        if (qinfo.type === 'mcma') {
          // full-match rule: chosen array equals correctOpts unordered => 1, else 0
          const chosen = Array.isArray(normalizedForDb) ? normalizedForDb.map((v:any)=>Number(v)).filter(n=>!isNaN(n)) : [];
          const correct = qinfo.correctOpts.map((n:number)=>Number(n)).filter(n=>!isNaN(n));
          // normalize sets
          const chosenSorted = chosen.slice().sort((a,b)=>a-b);
          const correctSorted = correct.slice().sort((a,b)=>a-b);
          const same = chosenSorted.length === correctSorted.length && chosenSorted.every((v,i)=>v === correctSorted[i]);
          if (same) score += 1;
        } else {
          // pg/tf: single choice
          const chosen = (normalizedForDb == null) ? NaN : Number(normalizedForDb);
          if (!isNaN(chosen) && qinfo.correctOpts.includes(chosen)) {
            score += 1;
          }
        }
      }

      // round
      score = Math.round((score + Number.EPSILON) * 1000) / 1000;

      // store score if column exists
      try {
        await tx`UPDATE attempts SET score = ${score}, max_score = ${max_score} WHERE id = ${attempt.id}`;
      } catch (e) {
        // ignore if column missing
      }

      return { attempt_id: attempt.id, score, max_score };
    });

    await sql.end().catch(() => {});
    return new Response(JSON.stringify({ ok: true, attempt_id: out.attempt_id, score: out.score, max_score: out.max_score }), { status: 201, headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    console.error('ATTEMPTS POST ERROR:', err);
    await sql.end().catch(() => {});
    return new Response(JSON.stringify({ message: 'Internal Error', error: err?.message || String(err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
