import type { RequestHandler } from '@sveltejs/kit';

async function getSql() {
  const { default: postgres } = await import('postgres');
  const conn = process.env.DATABASE_URL || 'postgresql://postgres:4312@localhost:5432/cbt_local';
  return postgres(conn);
}

function parseCookies(cookieHeader: string | null) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').map(s => s.trim()).reduce((acc:any, pair) => {
    const [k, ...rest] = pair.split('=');
    acc[k] = rest.join('=');
    return acc;
  }, {});
}

export const POST: RequestHandler = async ({ request }) => {
  const sql = await getSql();
  try {
    const cookies = parseCookies(request.headers.get('cookie'));
    const sid = cookies['cbt_sid'];
    if (sid) {
      await sql`delete from sessions where sid = ${sid}`;
    }
    await sql.end().catch(()=>{});

    // expire cookie immediately
    const cookie = `cbt_sid=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': cookie } });
  } catch (err: any) {
    console.error('STUDENT LOGOUT ERROR:', err);
    await sql.end().catch(()=>{});
    return new Response(JSON.stringify({ message: 'Internal Error', error: err?.message || String(err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
