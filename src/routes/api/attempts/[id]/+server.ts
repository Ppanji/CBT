import type { RequestHandler } from '@sveltejs/kit';
async function getSql(){ const { default: postgres } = await import('postgres'); const conn = process.env.DATABASE_URL || 'postgresql://postgres:4312@localhost:5432/cbt_local'; return postgres(conn); }

export const GET: RequestHandler = async ({ params }) => {
  const sql = await getSql();
  try {
    const attemptId = Number(params.id);
    if (!attemptId) { await sql.end().catch(()=>{}); return new Response(JSON.stringify({ message:'Invalid attempt id'}), { status:400, headers:{'content-type':'application/json'} }); }

    const att = await sql`select id, exam_id, student_name, started_at, finished_at, score, duration_seconds from attempts where id = ${attemptId} limit 1`;
    if (!Array.isArray(att) || !att.length) { await sql.end().catch(()=>{}); return new Response(JSON.stringify({ message:'Not found' }), { status:404, headers:{'content-type':'application/json'} }); }

    const answers = await sql`select id, question_id, answer from answers where attempt_id = ${attemptId} order by id`;
    await sql.end().catch(()=>{});
    return new Response(JSON.stringify({ attempt: att[0], answers }), { status:200, headers:{'content-type':'application/json'}});
  } catch (err:any) {
    console.error('ATTEMPT DETAIL GET ERROR', err);
    await sql.end().catch(()=>{});
    return new Response(JSON.stringify({ message:'Internal Error', error: err?.message || String(err)}), { status:500, headers:{'content-type':'application/json'}});
  }
};
