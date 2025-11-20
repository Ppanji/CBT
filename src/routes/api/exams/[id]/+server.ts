import type { RequestHandler } from "@sveltejs/kit";
import { db } from "$lib/db";
import { exams, questions, options } from "$lib/schema";

/**
 * GET tetap menggunakan Drizzle (sebelumnya ada)
 * DELETE menggunakan postgres client langsung supaya lebih toleran jika tabel attempts/answers tidak ada
 */

// GET /api/exams/[id]
export const GET: RequestHandler = async ({ params }) => {
  const id = Number(params.id);
  if (!id) return new Response(JSON.stringify({}), { status: 404 });

  try {
    const ex = await db.select().from(exams).where(exams.id.eq(id)).limit(1);
    if (!ex.length) return new Response(JSON.stringify({}), { status: 404 });

    const qs = await db.select().from(questions).where(questions.exam_id.eq(id)).orderBy(questions.id);
    const qWithOpts = [];
    for (const q of qs) {
      const opts = await db.select().from(options).where(options.question_id.eq(q.id)).orderBy(options.id);
      qWithOpts.push({ ...q, options: opts });
    }

    return new Response(JSON.stringify({ exam: ex[0], questions: qWithOpts }), { status: 200 });
  } catch (err) {
    console.error("EXAM GET ERROR:", err);
    return new Response(JSON.stringify({ message: "Internal Error", error: String(err) }), { status: 500 });
  }
};

// DELETE /api/exams/[id]
export const DELETE: RequestHandler = async ({ params }) => {
  const id = Number(params.id);
  if (!id) return new Response(JSON.stringify({ message: "Invalid exam id" }), { status: 400 });

  // gunakan postgres client langsung untuk delete flow yang toleran
  const { default: postgres } = await import("postgres");
  const conn = process.env.DATABASE_URL || "postgresql://postgres:4312@localhost:5432/cbt_local";
  const sql = postgres(conn, { max: 5 });

  try {
    // ambil question ids milik exam
    const qRows = await sql`select id from questions where exam_id = ${id}`;
    const qids = Array.isArray(qRows) ? qRows.map((r:any) => r.id) : [];

    if (qids.length) {
      // hapus opsi
      await sql`delete from options where question_id = any(${qids})`;
      // hapus questions
      await sql`delete from questions where id = any(${qids})`;
    }

    // hapus attempts/answers jika ada — bungkus supaya tidak crash bila tabel tidak ada
    try {
      await sql`delete from answers where attempt_id in (select id from attempts where exam_id = ${id})`;
      await sql`delete from attempts where exam_id = ${id}`;
    } catch(e) {
      // kalau tabel attempts/answers tidak ada, kita abaikan error ini
      console.warn("attempts/answers cleanup skipped or tables not present:", String(e));
    }

    // hapus exam
    const deleted = await sql`delete from exams where id = ${id} returning id`;
    await sql.end().catch(()=>{});

    if (!Array.isArray(deleted) || deleted.length === 0) {
      return new Response(JSON.stringify({ message: "Exam not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("EXAM DELETE ERROR:", err);
    await sql.end().catch(()=>{});
    return new Response(JSON.stringify({ message: "Internal Error", error: String(err) }), { status: 500 });
  }
};