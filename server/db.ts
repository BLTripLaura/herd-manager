/* Cloud database: Supabase Postgres (schema "herd"). Every call is async.
   run/all/get take SQLite-style "?" placeholders so the queries read the same as before.
   Inside tx(...) every query (drizzle or raw) goes through the same transaction. */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql as dsql, type SQL } from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";

const url = process.env.DATABASE_URL;
// A new copy without DATABASE_URL still starts, so the sign-in page can say which setting is missing
if (!url) console.error("DATABASE_URL is not set");
export const pg = postgres(url || "postgres://missing@127.0.0.1:1/missing", { connection: { search_path: "herd, public, extensions" }, prepare: false, max: Number(process.env.DB_POOL || 3), idle_timeout: 20, connect_timeout: 15, onnotice: () => {} });
const root = drizzle(pg);
type DB = typeof root;
const als = new AsyncLocalStorage<DB>();
/** The current transaction, or the shared connection */
export const db = new Proxy({} as DB, { get: (_t, k) => { const d: any = als.getStore() ?? root; const v = d[k]; return typeof v === "function" ? v.bind(d) : v; } });

export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (als.getStore()) return fn(); // already inside one
  return root.transaction((t) => als.run(t as any, fn));
}

function build(q: string, params: any[]): SQL {
  const parts = q.split("?");
  if (parts.length - 1 !== params.length) throw new Error(`SQL expects ${parts.length - 1} values, got ${params.length}: ${q}`);
  const chunks: SQL[] = [dsql.raw(parts[0])];
  params.forEach((p, i) => { chunks.push(dsql`${p === undefined ? null : p}`); chunks.push(dsql.raw(parts[i + 1])); });
  return dsql.join(chunks, dsql.raw(""));
}
export async function all<T = any>(q: string, ...params: any[]): Promise<T[]> {
  const r: any = await db.execute(build(q, params));
  return Array.from(r) as T[];
}
export async function get<T = any>(q: string, ...params: any[]): Promise<T | undefined> {
  return (await all<T>(q, ...params))[0];
}
export async function run(q: string, ...params: any[]) { await db.execute(build(q, params)); }
