import type { RequestHandler } from '@sveltejs/kit';
async function getSql(){ const { default: postgres } = await import('postgres'); const conn = process.env.DATABASE_URL || 'postgresql://postgres:4312@localhost:5432/cbt_local'; return postgres(conn); }

export const GET: RequestHandler = async ({ params }) => {
  const sql = await getSql();
  try {
    const examId = Number(params.id);
    if (!examId) { await sql.end().catch(()=>{}); return new Response(JSON.stringify({ message:'Invalid exam id'}), { status:400, headers:{'content-type':'application/json'} }); }

    const rows = await sql`select id, exam_id, student_name, started_at, finished_at, score, duration_seconds from attempts where exam_id=${examId} order by id desc`;
    await sql.end().catch(()=>{});
    return new Response(JSON.stringify(rows), { status:200, headers:{ 'content-type':'application/json' }});
  } catch (err:any) {
    console.error('EXAM ATTEMPTS GET ERROR', err);
    await sql.end().catch(()=>{});
    return new Response(JSON.stringify({ message:'Internal Error', error: err?.message || String(err)}), { status:500, headers:{'content-type':'application/json'}});
  }
};
