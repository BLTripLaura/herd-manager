/* Two herds in one app: "My herd" (real records) and a saved "Demo herd" for showing people the app.
   Each is kept as a full snapshot of every record table. Switching saves the one you're leaving
   (except the demo, which always goes back to its saved state) and loads the other. */
import { settings } from "./storage";
import { all, get, run, tx } from "./db";

const SKIP = new Set(["app_settings", "herd_snapshots", "app_users", "backups", "audit_log"]); // the system log is never swapped, restored or copied
export async function recordTables() {
  return (await all<{ name: string }>("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'herd' AND table_type = 'BASE TABLE' ORDER BY table_name"))
    .map((t) => t.name).filter((n) => !SKIP.has(n));
}
const todayIso = () => new Date().toISOString().slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const shift = (v: string, days: number) => { const d = new Date(v + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export type HerdName = "mine" | "demo";
export const activeHerd = async (): Promise<HerdName> => ((await settings.get("activeHerd")) === "demo" ? "demo" : "mine");

/** Picture tables: their image data is large, so nightly copies keep only the details (goat, date, caption) */
const IMAGE_TABLES: Record<string, string> = { animal_photos: "id, animal_id, date, caption", animal_papers: "id, animal_id, date, label" };

/** Every record table as { table: rows[] } (column names as stored). lite leaves out picture data. */
export async function dumpAll(lite = false) {
  const data: Record<string, any[]> = {};
  for (const t of await recordTables()) data[t] = await all(`SELECT ${lite && IMAGE_TABLES[t] ? IMAGE_TABLES[t] : "*"} FROM "${t}" ORDER BY id`);
  return data;
}

export async function snapshot(name: string) {
  const data = await dumpAll();
  const goats = (data.animals ?? []).length;
  await run("INSERT INTO herd_snapshots (name, saved_at, data, goats) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET saved_at = excluded.saved_at, data = excluded.data, goats = excluded.goats",
    name, todayIso(), JSON.stringify(data), goats);
  return { name, savedAt: todayIso(), goats };
}

/** Replace every record with a set of rows. days slides all dates forward (a saved demo always looks current). */
export async function loadAll(data: Record<string, any[]>, days = 0) {
  await tx(async () => {
    const tables = await recordTables();
    await run(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY`);
    const have = new Set(tables);
    for (const [t, rows] of Object.entries(data)) {
      if (!have.has(t) || !rows.length) continue;
      const cols = new Set((await all<{ c: string }>("SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'herd' AND table_name = ?", t)).map((c) => c.c));
      const bools = new Set((await all<{ c: string }>("SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'herd' AND table_name = ? AND data_type = 'boolean'", t)).map((c) => c.c));
      const keys = Object.keys(rows[0]).filter((k) => cols.has(k));
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const vals: any[] = [];
        for (const r of chunk) for (const k of keys) {
          let v = r[k];
          if (bools.has(k) && v !== null && v !== undefined) v = v === true || v === 1 || v === "1" || v === "true";
          if (days && typeof v === "string" && ISO.test(v)) v = shift(v, days);
          vals.push(v);
        }
        await run(`INSERT INTO "${t}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES ${chunk.map(() => `(${keys.map(() => "?").join(",")})`).join(",")}`, ...vals);
      }
      if (cols.has("id")) await run(`SELECT setval(pg_get_serial_sequence('herd."${t}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${t}"), 1), (SELECT COUNT(*) > 0 FROM "${t}"))`);
    }
  });
}

export async function restore(name: string, moveDates = false) {
  const row: any = await get("SELECT * FROM herd_snapshots WHERE name = ?", name);
  const data: Record<string, any[]> = row ? JSON.parse(row.data) : {};
  const days = moveDates && row ? Math.round((Date.parse(todayIso()) - Date.parse(row.saved_at)) / 86400000) : 0;
  await loadAll(data, days);
  return { goats: (data.animals ?? []).length, days };
}

export async function herdInfo() {
  const rows = await all("SELECT name, saved_at AS \"savedAt\", goats FROM herd_snapshots");
  const pick = (n: string) => rows.find((r: any) => r.name === n) ?? null;
  return { active: await activeHerd(), demo: pick("demo"), mine: pick("mine") };
}

/** Switch herds. Leaving "mine" saves it first (plus a spare copy); leaving the demo throws away demo changes. */
export async function switchTo(target: HerdName) {
  const cur = await activeHerd();
  if (target === cur) return herdInfo();
  if (target === "demo") {
    if (!(await herdInfo()).demo) throw new Error("No demo herd has been saved yet.");
    await run("INSERT INTO herd_snapshots (name, saved_at, data, goats) SELECT 'mine-previous', saved_at, data, goats FROM herd_snapshots WHERE name = 'mine' ON CONFLICT(name) DO UPDATE SET saved_at = excluded.saved_at, data = excluded.data, goats = excluded.goats");
    await snapshot("mine");
    await restore("demo", true);
  } else {
    await restore("mine");
  }
  await settings.set("activeHerd", target);
  return herdInfo();
}
