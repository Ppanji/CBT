// src/routes/api/exams/+server.ts
import type { RequestHandler } from '@sveltejs/kit';

async function getSqlClient() {
  const { default: postgres } = await import('postgres');
  const conn = process.env.DATABASE_URL || 'postgresql://postgres:4312@localhost:5432/cbt_local';
  return postgres(conn);
}

export const GET: RequestHandler = async () => {
  const sql = await getSqlClient();
  try {
    const exams = await sql`select id, title, description, created_at from exams`;
    await sql.end();
    return new Response(JSON.stringify(exams), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    console.error('EXAMS GET ERROR:', err);
    await sql.end().catch(() => {});
    return new Response(JSON.stringify({ message: 'Internal Error', error: err?.message || String(err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  const sql = await getSqlClient();
  try {
    const body = await request.json();
    const title = (body.title ?? '').toString().trim();
    const description = (body.description ?? '').toString().trim();

    if (!title) {
      await sql.end();
      return new Response(JSON.stringify({ message: 'Title is required' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    // Use tagged template literal with parameters (safe)
    const inserted = await sql`insert into exams (title, description) values (${title}, ${description}) returning id, title, description, created_at`;
    await sql.end();

    // postgres client returns array of rows
    const created = Array.isArray(inserted) && inserted.length ? inserted[0] : null;

    return new Response(JSON.stringify(created), { status: 201, headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    console.error('EXAMS POST ERROR:', err);
    await sql.end().catch(() => {});
    return new Response(JSON.stringify({ message: 'Internal Error', error: err?.message || String(err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
