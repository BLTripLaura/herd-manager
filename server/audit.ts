/* System log: every change anyone makes (add, change, delete, dose given, sign-in…) is written down
   with the date and time, who did it, and what was sent. The owner can read it in the app (System log).
   It can't be changed or deleted from the app, and herd switching / restores leave it alone. */
import type { Express, Request, Response, NextFunction } from "express";
import { all, get, run } from "./db";
import { resources, type ResourceName } from "./storage";

export const AUDIT_SQL = `create table if not exists herd.audit_log (
  id bigserial primary key, at timestamptz not null default now(), who text, who_name text, role text,
  method text, path text, action text, summary text, data text, before text, status integer)`;

const LABEL: Record<string, string> = {
  animals: "goat", weights: "weight", medications: "medicine", treatments: "treatment", breedings: "breeding", milk: "milk record",
  tasks: "to-do", pastures: "pasture", pastureMoves: "pasture move", outsideBucks: "outside buck", heats: "heat", shows: "show",
  animalNotes: "note", lactations: "lactation", care: "care record", breedingPlans: "breeding plan", contacts: "phone contact",
  photos: "photo", papers: "paper", users: "login", settings: "setting",
};
const SECRET = /pass(word)?|token|secret|key$/i;
/** Copy of what was sent, with passwords removed and big pictures shortened */
function clean(v: any, depth = 0): any {
  if (v == null || depth > 6) return v;
  if (typeof v === "string") return v.length > 300 ? `${v.slice(0, 80)}… (${v.length} characters)` : v;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => clean(x, depth + 1));
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET.test(k) ? "(hidden)" : clean(x, depth + 1)]));
  return v;
}
const isRes = (r: string): r is ResourceName => r in resources;

/** Goat names for the animal ids mentioned in a request */
async function goatNames(...objs: any[]) {
  const ids = new Set<number>();
  const take = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(take);
    for (const k of ["animalId", "doeId", "buckId"]) if (Number(o[k]) > 0) ids.add(Number(o[k]));
    if (typeof o.animalIds === "string") o.animalIds.split(",").map(Number).filter(Boolean).forEach((x: number) => ids.add(x));
    if (Array.isArray(o.treatments)) o.treatments.forEach(take);
    if (Array.isArray(o.rows)) o.rows.forEach(take);
  };
  objs.forEach(take);
  if (!ids.size) return [] as string[];
  const rows = await all<{ name: string; nick: string | null }>(`SELECT name, barn_name AS nick FROM animals WHERE id IN (${Array.from(ids).slice(0, 40).join(",")})`).catch(() => all<{ name: string; nick: null }>(`SELECT name, null AS nick FROM animals WHERE id IN (${Array.from(ids).slice(0, 40).join(",")})`));
  return rows.map((r) => r.nick || r.name);
}
/** A few words that say what the record is: "Meloxicam", "52 lb", "FAMACHA 3" */
function describe(o: any): string {
  if (!o || typeof o !== "object" || Array.isArray(o)) return "";
  const bits = [o.medName ?? o.name ?? o.title ?? o.kind ?? o.label ?? o.showName, o.score, o.lbs != null ? `${o.lbs} lb` : null, o.date ?? o.dueDate].filter((x) => x != null && x !== "");
  return bits.map(String).join(" · ").slice(0, 160);
}

async function summarize(req: Request, before: any): Promise<{ action: string; summary: string }> {
  const parts = req.path.split("/").filter(Boolean); // after /api
  const m = req.method;
  const body = req.body ?? {};
  const goats = await goatNames(body, before);
  const who = goats.length ? ` for ${goats.slice(0, 6).join(", ")}${goats.length > 6 ? ` +${goats.length - 6} more` : ""}` : "";
  const [a, b, c] = parts;
  let action = `${m} /${parts.join("/")}`;
  let what = "";
  if (a === "treatments" && b === "batch") { action = "Logged treatment"; what = describe(body.treatments?.[0]) + (body.repeat?.ongoing ? " · repeats until resolved" : body.repeat?.times ? ` · ${body.repeat.times} repeats` : ""); }
  else if (a === "tasks" && c === "give") { action = body.stopAfter ? "Gave last dose" : "Gave dose"; const t = await get("SELECT title FROM tasks WHERE id = ?", Number(b)).catch(() => null); what = (t as any)?.title ?? `to-do #${b}`; }
  else if (a === "tasks" && c === "stop") { action = "Stopped doses"; const t = await get("SELECT title FROM tasks WHERE id = ?", Number(b)).catch(() => null); what = (t as any)?.title ?? `to-do #${b}`; }
  else if (a === "tasks" && c === "skip") { action = "Skipped dose"; const t = await get("SELECT title FROM tasks WHERE id = ?", Number(b)).catch(() => null); what = (t as any)?.title ?? `to-do #${b}`; }
  else if (a && b === "bulk") { action = `Added ${LABEL[a] ?? a}s`; what = `${Array.isArray(body) ? body.length : (body.rows?.length ?? "")} records`; }
  else if (a && LABEL[a] && parts.length === 1 && m === "POST") { action = `Added ${LABEL[a]}`; what = describe(body); }
  else if (a && LABEL[a] && parts.length === 2 && (m === "PATCH" || m === "PUT")) {
    action = `Changed ${LABEL[a]}`;
    const same = (x: any, y: any) => JSON.stringify(x === "" || x === undefined ? null : x) === JSON.stringify(y === "" || y === undefined ? null : y);
    const changed = before ? Object.keys(body).filter((k) => k !== "id" && !same(body[k], before[k])) : Object.keys(body);
    what = [describe(before ?? body), changed.length ? `changed ${changed.slice(0, 8).join(", ")}` : "no changes"].filter(Boolean).join(" · ");
  }
  else if (a && m === "DELETE") { action = `Deleted ${LABEL[a] ?? a}`; what = describe(before) || (b ? `#${b}` : parts.slice(1).join(" ")); }
  else if (a === "me" && b === "password") action = "Changed own password";
  return { action, summary: `${what}${who}`.trim() };
}

export function registerAudit(app: Express, ownerOnly: (req: Request, res: Response, next: NextFunction) => void) {
  // Read the log (owner only). Newest first; search matches who, what and the details.
  app.get("/api/audit", ownerOnly, async (req, res) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const from = String(req.query.from ?? ""), to = String(req.query.to ?? "");
    const tzq = String(req.query.tz ?? "");
    const tz = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tzq) ? tzq : "America/New_York";
    const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 200));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const where: string[] = [], params: any[] = [];
    if (q) { where.push("(lower(coalesce(who_name,'') || ' ' || coalesce(who,'') || ' ' || coalesce(action,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(data,'') || ' ' || coalesce(before,'')) LIKE ?)"); params.push(`%${q}%`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push("at >= (?::date)::timestamp AT TIME ZONE '${tz}'"); params.push(from); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push("at < ((?::date) + 1)::timestamp AT TIME ZONE '${tz}'"); params.push(to); }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await all(`SELECT id, at, who, who_name AS "whoName", role, method, path, action, summary, data, before, status FROM herd.audit_log ${w} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`, ...params);
    const total: any = await get(`SELECT count(*)::int AS n FROM herd.audit_log ${w}`, ...params);
    res.json({ rows, total: total?.n ?? rows.length });
  });

}

/** Write down every change before it's made (so nothing is missed), then add how it turned out.
    Registered right after the sign-in check so every change (logins, settings, records) is covered. */
export function registerAuditWriter(app: Express) {
  app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.path.startsWith("/cron/") || req.path.startsWith("/auth/")) return next();
    try {
      const parts = req.path.split("/").filter(Boolean);
      let before: any = null;
      if (parts.length === 2 && isRes(parts[0]) && ["PATCH", "PUT", "DELETE"].includes(req.method) && Number(parts[1]) > 0) {
        const { db } = await import("./db");
        const { eq } = await import("drizzle-orm");
        const t: any = resources[parts[0]].table;
        [before] = await db.select().from(t).where(eq(t.id, Number(parts[1])));
      } else if (req.method === "DELETE" && parts.length === 2 && ["photos", "papers"].includes(parts[0])) {
        before = await get(`SELECT id, animal_id AS "animalId", date, ${parts[0] === "photos" ? "caption" : "label"} AS label FROM ${parts[0] === "photos" ? "animal_photos" : "animal_papers"} WHERE id = ?`, Number(parts[1])).catch(() => null);
      } else if (req.method === "DELETE" && parts[0] === "milk" && parts[1] === "test" && parts[2]) {
        before = { date: parts[2], records: (await all("SELECT animal_id AS \"animalId\", date, lbs FROM milk WHERE date = ?", parts[2]).catch(() => [])) };
      }
      const { action, summary } = await summarize(req, before);
      const u = req.user;
      const row: any = await get(
        "INSERT INTO herd.audit_log (who, who_name, role, method, path, action, summary, data, before) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
        u?.email ?? null, u?.name ?? null, u?.role ?? null, req.method, "/api" + req.path, action, summary || null,
        req.body && Object.keys(req.body).length ? JSON.stringify(clean(req.body)).slice(0, 20000) : null,
        before ? JSON.stringify(clean(before)).slice(0, 20000) : null,
      );
      res.on("finish", () => { if (row?.id) run("UPDATE herd.audit_log SET status = ? WHERE id = ?", res.statusCode, row.id).catch(() => {}); });
    } catch (e) { console.error("audit", e); }
    next();
  });
}

/** Sign-ins (and failed tries) go in the log too */
export async function auditLogin(email: string, ok: boolean, name?: string | null, role?: string | null) {
  await run("INSERT INTO herd.audit_log (who, who_name, role, method, path, action, summary, status) VALUES (?, ?, ?, 'POST', '/api/auth/login', ?, ?, ?)",
    email, name ?? null, role ?? null, ok ? "Signed in" : "Sign-in failed", ok ? null : "Wrong password or not on the list", ok ? 200 : 401).catch(() => {});
}
