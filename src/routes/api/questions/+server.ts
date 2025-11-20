import type { RequestHandler } from '@sveltejs/kit';

async function getSql() {
  const { default: postgres } = await import('postgres');
  const conn = process.env.DATABASE_URL || 'postgresql://postgres:4312@localhost:5432/cbt_local';
  // create a fresh client for this request (you already closed it before)
  return postgres(conn);
}

export const POST: RequestHandler = async ({ request }) => {
  const sql = await getSql();
  try {
    const body = await request.json();

    // minimal validation
    const exam_id = Number(body.exam_id);
    const text = (body.text ?? '').toString().trim();
    const type = (body.type ?? 'pg').toString();
    const opts = Array.isArray(body.opts) ? body.opts : [];

    if (!exam_id || !text) {
      await sql.end().catch(() => {});
      return new Response(JSON.stringify({ message: 'exam_id and text are required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Normalize options: filter out empty texts, coerce is_correct
    const normalizedOpts = opts
      .map((o: any) => ({ text: (o?.text ?? '').toString().trim(), is_correct: !!o?.is_correct }))
      .filter((o: any) => o.text.length > 0);

    // Run everything inside a transaction so partial inserts cannot happen
    const result = await sql.begin(async (tx: any) => {
      // insert question and return inserted row
      const qRows = await tx`
        insert into questions (exam_id, text, type, extra)
        values (${exam_id}, ${text}, ${type}, ${null})
        returning id, exam_id, text, type, extra
      `;
      const q = Array.isArray(qRows) && qRows.length ? qRows[0] : null;
      if (!q) throw new Error('Failed to create question');

      // insert options (if any). Keep per-row insert inside transaction.
      const insertedOpts: any[] = [];
      for (const o of normalizedOpts) {
        const r = await tx`
          insert into options (question_id, text, is_correct)
          values (${q.id}, ${o.text}, ${o.is_correct ? 1 : 0})
          returning id, question_id, text, is_correct
        `;
        if (Array.isArray(r) && r.length) insertedOpts.push(r[0]);
      }

      // return aggregated object
      return { question: q, options: insertedOpts };
    });

    await sql.end().catch(() => {});

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  } catch (err: any) {
    console.error('QUESTIONS POST ERROR:', err);
    try { await sql.end().catch(() => {}); } catch(e) {}
    return new Response(JSON.stringify({ message: 'Internal Error', error: err?.message || String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
