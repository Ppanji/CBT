import type { RequestHandler } from '@sveltejs/kit';

async function getSql() {
  const { default: postgres } = await import('postgres');
  const conn = process.env.DATABASE_URL || 'postgresql://postgres:4312@localhost:5432/cbt_local';
  return postgres(conn);
}

// GET /api/exams/[id]/questions?page=1&limit=10
export const GET: RequestHandler = async ({ params, url }) => {
  const sql = await getSql();
  try {
    const examId = Number(params.id);
    if (!examId) {
      await sql.end().catch(() => {});
      return new Response(JSON.stringify({ message: 'Invalid exam id' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    // parse pagination params
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || '10')));
    const offset = (page - 1) * limit;

    // total count (safe conversion to number)
    const countRow = await sql`select count(*)::text as cnt from questions where exam_id = ${examId}`;
    let total = 0;
    if (Array.isArray(countRow) && countRow.length) {
      total = Number((countRow[0] as any).cnt || 0);
    } else if (typeof countRow === 'object' && (countRow as any).cnt) {
      total = Number((countRow as any).cnt || 0);
    }

    // if no questions at all, return empty paginated response
    if (!total) {
      await sql.end().catch(() => {});
      return new Response(JSON.stringify({ items: [], total: 0, page, totalPages: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    // ambil questions paginated
    const qRows = await sql`
      select id, exam_id, text, type, extra
      from questions
      where exam_id = ${examId}
      order by id
      limit ${limit}
      offset ${offset}
    `;

    // aggregate options for questions in this page using single query (safe array binding)
    const questionIds = qRows.map((r: any) => r.id);
    let optsRows: any[] = [];
    if (questionIds.length) {
      // use ANY(array) to fetch options for these question ids
      optsRows = await sql`select id, question_id, text, is_correct from options where question_id = any(${questionIds}) order by id`;
    }

    // map options per question
    const mapOpts = new Map<number, any[]>();
    for (const o of optsRows) {
      if (!mapOpts.has(o.question_id)) mapOpts.set(o.question_id, []);
      mapOpts.get(o.question_id).push({ id: o.id, text: o.text, is_correct: Boolean(o.is_correct) });
    }

    const items = qRows.map((q: any) => ({
      id: q.id,
      exam_id: q.exam_id,
      text: q.text,
      type: q.type,
      extra: q.extra,
      options: mapOpts.get(q.id) || []
    }));

    const totalPages = Math.ceil(total / limit) || 0;

    await sql.end().catch(() => {});
    return new Response(JSON.stringify({ items, total, page, totalPages }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    console.error('EXAM QUESTIONS GET ERROR:', err);
    await sql.end().catch(() => {});
    return new Response(JSON.stringify({ message: 'Internal Error', error: err?.message || String(err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
