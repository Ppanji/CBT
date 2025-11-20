import type { RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'crypto';

async function getSql() {
  const { default: postgres } = await import('postgres');
  const conn = process.env.DATABASE_URL || 'postgresql://postgres:4312@localhost:5432/cbt_local';
  return postgres(conn);
}

export const POST: RequestHandler = async ({ request }) => {
  const sql = await getSql();
  try {
    const body = await request.json();
    const subject = (body.subject ?? '').toString();
    const fullname = (body.fullname ?? '').toString();
    const kelas = (body.kelas ?? '').toString();

    if (!subject || !fullname || !kelas) {
      await sql.end().catch(()=>{});
      return new Response(JSON.stringify({ message: 'subject, fullname, kelas required' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    // create session id and expiry (4 hours)
    const sid = randomUUID();
    const ttlMs = 4 * 60 * 60 * 1000; // 4 hours
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const studentObj = { subject, fullname, kelas };

    // insert session
    await sql`insert into sessions (sid, student, expires_at) values (${sid}, ${JSON.stringify(studentObj)}, ${expiresAt})`;

    await sql.end().catch(()=>{});

    // set cookie (HttpOnly). For local dev allow Secure = false.
    const cookie = `cbt_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttlMs/1000)}`;
    // If you are on production with HTTPS, add `; Secure`
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': cookie
      }
    });
  } catch (err: any) {
    console.error('STUDENT LOGIN ERROR:', err);
    await sql.end().catch(()=>{});
    return new Response(JSON.stringify({ message: 'Internal Error', error: err?.message || String(err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
