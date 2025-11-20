import type { RequestHandler } from '@sveltejs/kit';

async function getSql() {
  const { default: postgres } = await import('postgres');
  const conn = process.env.DATABASE_URL || 'postgresql://postgres:4312@localhost:5432/cbt_local';
  return postgres(conn);
}

export const DELETE: RequestHandler = async ({ params }) => {
  const sql = await getSql();
  try {
    const qid = Number(params.id);
    if (!qid) {
      await sql.end().catch(()=>{});
      return new Response(JSON.stringify({ message: 'Invalid question id' }), { status: 400, headers: { 'content-type':'application/json' } });
    }

    // delete options then question
    await sql`delete from options where question_id = ${qid}`;
    const r = await sql`delete from questions where id = ${qid} returning id`;
    await sql.end().catch(()=>{});

    if (!Array.isArray(r) || r.length === 0) {
      return new Response(JSON.stringify({ message: 'Question not found' }), { status: 404, headers:{ 'content-type':'application/json' }});
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type':'application/json' } });
  } catch (err:any) {
    console.error('QUESTION DELETE ERROR:', err);
    await sql.end().catch(()=>{});
    return new Response(JSON.stringify({ message: 'Internal Error', error: err?.message || String(err) }), { status:500, headers: { 'content-type':'application/json' } });
  }
};