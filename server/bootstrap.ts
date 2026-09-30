/* First start on a brand-new Supabase project: build the herd tables and stock the Medicine Cabinet.
   Safe to run every start; it only acts when the tables aren't there yet. */
import { pg, get, run } from "./db";
import { setupSql } from "./setup-sql";
import seedMeds from "./seed-meds.json";

let done: Promise<void> | null = null;

async function build() {
  // Every statement is "if not exists" / "or replace", so a half-finished first run just completes
  const have = await get<{ t: string | null }>("SELECT to_regclass('herd.contacts')::text AS t");
  const done_ = await get<{ n: number }>("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'herd'").catch(() => ({ n: 0 }));
  if (!have?.t || (done_?.n ?? 0) < 23) await pg.unsafe(setupSql);
  const n = await get<{ n: number }>("SELECT count(*)::int AS n FROM medications");
  const seeded = await get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'medsSeeded'");
  if (!n?.n && !seeded) {
    for (const m of seedMeds as any[]) {
      await run(
        "INSERT INTO medications (name, category, concentration, dose_amount, dose_unit, route, repeat_days, repeat_unit, repeat_times, milk_withdrawal_days, meat_withdrawal_days, on_hand_ml, reorder_at_ml, vet_confirmed, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, false, ?)",
        m.name, m.category, m.concentration, m.dose_amount, m.dose_unit, m.route, m.repeat_days, m.repeat_unit ?? "days", m.repeat_times ?? 0, m.milk_withdrawal_days ?? 0, m.meat_withdrawal_days ?? 0, m.notes,
      );
    }
  }
  if (!seeded) await run("INSERT INTO app_settings (key, value) VALUES ('medsSeeded', 'true') ON CONFLICT (key) DO NOTHING");
}

/** Runs once per server start; a failure is retried on the next request */
export function ensureSetup() {
  if (!done) done = build().catch((e) => { done = null; throw e; });
  return done;
}
