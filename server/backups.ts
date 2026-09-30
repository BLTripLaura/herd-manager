// Nightly herd backups (run by a Vercel scheduled job at about 2:00 AM Eastern): a full copy of every record
// saved in the database, keeping the last 30. Any copy can be downloaded as an Excel workbook.
import { gzipSync, gunzipSync } from "node:zlib";
import { all, get, run } from "./db";
import { activeHerd, dumpAll } from "./herds";
import { settings } from "./storage";

const KEEP = 30;
const TZ = "America/New_York";
const easternDate = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: TZ });

export async function listBackups() {
  const rows = await all("SELECT date, saved_at AS \"savedAt\", goats, bytes FROM backups ORDER BY date DESC");
  return rows.map((r: any) => ({ name: `goat-joy-herd-${r.date}`, date: r.date, savedAt: new Date(r.savedAt).toISOString(), goats: r.goats, bytes: r.bytes }));
}

/** Save today's copy (replaces an earlier copy from the same day), then keep only the newest 30.
    While the demo herd is open, the copy is taken from the saved "My herd" instead. */
export async function runBackup() {
  const date = easternDate();
  let data: Record<string, any[]>;
  if ((await activeHerd()) === "demo") {
    const snap: any = await get("SELECT data FROM herd_snapshots WHERE name = 'mine'");
    data = snap ? JSON.parse(snap.data) : {};
    for (const t of ["animal_photos", "animal_papers"]) data[t] = (data[t] ?? []).map(({ full, thumb, mini, ...rest }: any) => rest);
  } else data = await dumpAll(true);
  const packed = gzipSync(Buffer.from(JSON.stringify(data)));
  await run("INSERT INTO backups (date, saved_at, goats, bytes, data) VALUES (?, now(), ?, ?, ?) ON CONFLICT(date) DO UPDATE SET saved_at = now(), goats = excluded.goats, bytes = excluded.bytes, data = excluded.data",
    date, (data.animals ?? []).length, packed.length, packed);
  await run(`DELETE FROM backups WHERE date NOT IN (SELECT date FROM backups ORDER BY date DESC LIMIT ${KEEP})`);
  return date;
}

export async function backupData(date: string) {
  const r: any = await get("SELECT data FROM backups WHERE date = ?", date);
  return r ? (JSON.parse(gunzipSync(Buffer.from(r.data)).toString("utf8")) as Record<string, any[]>) : null;
}

const SHEETS: [string, string][] = [
  ["animals", "Animals"], ["treatments", "Treatments"], ["care_records", "Care"], ["weights", "Weights"], ["medications", "Medications"],
  ["breedings", "Breedings"], ["breeding_plans", "Breeding plans"], ["heats", "Heats"], ["milk", "Milk tests"], ["lactations", "Lactations"],
  ["tasks", "Tasks"], ["pastures", "Pastures"], ["pasture_moves", "Pasture moves"], ["outside_bucks", "Tank & guest bucks"],
  ["shows", "Shows"], ["animal_notes", "Animal notes"],
];

/** Every record in one Excel workbook, one sheet per kind of record. Uses a saved copy when given, else the live herd. */
export async function backupWorkbook(saved?: { date: string; data: Record<string, any[]> }): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const data = saved?.data ?? await dumpAll(true);
  const demo = !saved && (await activeHerd()) === "demo";
  const wb = new ExcelJS.Workbook();
  wb.creator = "Herd Manager";
  const about = wb.addWorksheet("About");
  about.addRows([["Herd Manager backup"], ["Saved", saved ? `Nightly copy of ${saved.date}` : new Date().toLocaleString("en-US", { timeZone: TZ })],
    ["Herd", demo ? "DEMO herd was open when this was saved. Your own herd is in the nightly copies." : "My herd"],
    ["Goats", (data.animals ?? []).length], ["Treatments", (data.treatments ?? []).length]]);
  about.getColumn(1).width = 16; about.getColumn(2).width = 60; about.getRow(1).font = { bold: true, size: 13 };
  for (const [t, label] of SHEETS) {
    const rows = data[t] ?? [];
    const ws = wb.addWorksheet(label, { views: [{ state: "frozen", ySplit: 1 }] });
    const cols = rows.length ? Object.keys(rows[0]) : ["id"];
    ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(10, c.length + 2)) }));
    for (const row of rows) ws.addRow(cols.map((c) => (row[c] === null || row[c] === undefined ? null : typeof row[c] === "object" ? JSON.stringify(row[c]) : row[c])));
    ws.getRow(1).font = { bold: true };
  }
  void settings;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
