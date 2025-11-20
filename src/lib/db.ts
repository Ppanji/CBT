import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

/**
 * DB init untuk Drizzle + PostgresJS
 * Pastikan .env punya DATABASE_URL, contoh:
 * DATABASE_URL=postgresql://user:password@localhost:5432/cbt_db
 */
const connectionString = process.env.DATABASE_URL || '';
const sql = postgres(connectionString, { max: 10 });

export const db = drizzle(sql);
