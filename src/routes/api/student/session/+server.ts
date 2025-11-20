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

export const GET: RequestHandler = async ({ request }) => {
  const sql = await getSql();
  try {
    const cookies = parseCookies(request.headers.get('cookie'));
    const sid = cookies['cbt_sid'];
    if (!sid) {
      await sql.end().catch(()=>{});
      return new Response(JSON.stringify({ message: 'No session' }), { status: 401, headers: { 'content-type': 'application/json' } });
    }

    // fetch session and check expiry
    const rows = await sql`select sid, student, expires_at from sessions where sid = ${sid} limit 1`;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sql.end().catch(()=>{});
      return new Response(JSON.stringify({ message: 'Invalid session' }), { status: 401, headers: { 'content-type': 'application/json' } });
    }
    const s = rows[0] as any;
    const expiresAt = new Date(s.expires_at).getTime();
    if (Date.now() > expiresAt) {
      // expired -> delete
      await sql`delete from sessions where sid = ${sid}`;
      await sql.end().catch(()=>{});
      return new Response(JSON.stringify({ message: 'Session expired' }), { status: 401, headers: { 'content-type': 'application/json' } });
    }

    await sql.end().catch(()=>{});
    return new Response(JSON.stringify({ student: s.student }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    console.error('STUDENT SESSION ERROR:', err);
    await sql.end().catch(()=>{});
    return new Response(JSON.stringify({ message: 'Internal Error', error: err?.message || String(err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
