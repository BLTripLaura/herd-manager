/* Filing cabinets: Reference documents and Sale documents. Files (PDF, pictures, Word…) are kept in the
   database in pieces of about 2 MB so big files get past the 4.5 MB limit on each request.
   A document can be sent to someone with a link that works for 7 days without signing in. */
import type { Express } from "express";
import { randomBytes } from "node:crypto";
import { all, get, run } from "./db";

export const DOCS_SQL = `create table if not exists herd.documents (
  id serial primary key, cabinet text not null, title text not null, folder text, animal_id integer, doc_date text, notes text,
  file_name text not null, mime text, size integer, chunks integer not null default 1, ready boolean not null default false,
  thumb text, created_at timestamptz not null default now(), created_by text);
create table if not exists herd.document_chunks (doc_id integer not null, n integer not null, data text not null, primary key (doc_id, n));
create table if not exists herd.document_shares (token text primary key, doc_id integer not null, expires_at timestamptz not null, created_at timestamptz not null default now(), created_by text);`;

const CABINETS = new Set(["reference", "sale"]);
const MAX_BYTES = 30 * 1024 * 1024;
const COLS = `id, cabinet, title, folder, animal_id AS "animalId", doc_date AS "docDate", notes, file_name AS "fileName", mime, size, chunks, thumb, created_at AS "createdAt", created_by AS "createdBy"`;
const txt = (v: any, n = 300) => (v == null || String(v).trim() === "" ? null : String(v).trim().slice(0, n));

export function registerDocuments(app: Express) {
  app.get("/api/documents", async (req, res) => {
    const cab = String(req.query.cabinet ?? "");
    const rows = await all(`SELECT ${COLS} FROM herd.documents WHERE ready = true ${CABINETS.has(cab) ? "AND cabinet = ?" : ""} ORDER BY coalesce(doc_date, to_char(created_at, 'YYYY-MM-DD')) DESC, id DESC`, ...(CABINETS.has(cab) ? [cab] : []));
    res.json(rows);
  });
  // Start an upload: the details first, then each piece, then it shows in the cabinet
  app.post("/api/documents", async (req, res) => {
    const b = req.body ?? {};
    if (!CABINETS.has(b.cabinet)) return res.status(400).json({ message: "Pick Reference or Sale documents" });
    if (!txt(b.title)) return res.status(400).json({ message: "Give the document a name" });
    const size = Number(b.size) || 0, chunks = Math.max(1, Math.min(40, Number(b.chunks) || 1));
    if (size > MAX_BYTES) return res.status(400).json({ message: "That file is over 30 MB. Try a smaller copy." });
    const r: any = await get(`INSERT INTO herd.documents (cabinet, title, folder, animal_id, doc_date, notes, file_name, mime, size, chunks, thumb, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      b.cabinet, txt(b.title), txt(b.folder, 80), Number(b.animalId) > 0 ? Number(b.animalId) : null, txt(b.docDate, 10), txt(b.notes, 2000),
      txt(b.fileName, 200) ?? "document", txt(b.mime, 120), size, chunks, typeof b.thumb === "string" && b.thumb.length < 120000 ? b.thumb : null, req.user?.name ?? req.user?.email ?? null);
    res.json({ id: r.id });
  });
  app.post("/api/documents/:id/chunk/:n", async (req, res) => {
    const id = Number(req.params.id), n = Number(req.params.n), data = req.body?.data;
    const d: any = await get("SELECT chunks, ready FROM herd.documents WHERE id = ?", id);
    if (!d || d.ready || !(n >= 0 && n < d.chunks) || typeof data !== "string") return res.status(400).json({ message: "Upload piece not accepted" });
    await run("INSERT INTO herd.document_chunks (doc_id, n, data) VALUES (?, ?, ?) ON CONFLICT (doc_id, n) DO UPDATE SET data = excluded.data", id, n, data);
    res.json({ ok: true });
  });
  app.post("/api/documents/:id/finish", async (req, res) => {
    const id = Number(req.params.id);
    const d: any = await get("SELECT chunks FROM herd.documents WHERE id = ?", id);
    const have: any = await get("SELECT count(*)::int AS n FROM herd.document_chunks WHERE doc_id = ?", id);
    if (!d || have?.n !== d.chunks) return res.status(400).json({ message: "Part of the file didn't arrive. Try again." });
    await run("UPDATE herd.documents SET ready = true WHERE id = ?", id);
    // clean up uploads that were started more than a day ago and never finished
    await run("DELETE FROM herd.document_chunks WHERE doc_id IN (SELECT id FROM herd.documents WHERE ready = false AND created_at < now() - interval '1 day')");
    await run("DELETE FROM herd.documents WHERE ready = false AND created_at < now() - interval '1 day'");
    res.json(await get(`SELECT ${COLS} FROM herd.documents WHERE id = ?`, id));
  });
  app.get("/api/documents/:id/chunk/:n", async (req, res) => {
    const r: any = await get("SELECT data FROM herd.document_chunks WHERE doc_id = ? AND n = ?", Number(req.params.id), Number(req.params.n));
    if (!r) return res.status(404).json({ message: "Not found" });
    res.json({ data: r.data });
  });
  app.patch("/api/documents/:id", async (req, res) => {
    const id = Number(req.params.id), b = req.body ?? {};
    const sets: string[] = [], vals: any[] = [];
    const put = (col: string, v: any) => { sets.push(`${col} = ?`); vals.push(v); };
    if ("title" in b) { if (!txt(b.title)) return res.status(400).json({ message: "Give the document a name" }); put("title", txt(b.title)); }
    if ("folder" in b) put("folder", txt(b.folder, 80));
    if ("notes" in b) put("notes", txt(b.notes, 2000));
    if ("docDate" in b) put("doc_date", txt(b.docDate, 10));
    if ("animalId" in b) put("animal_id", Number(b.animalId) > 0 ? Number(b.animalId) : null);
    if ("cabinet" in b && CABINETS.has(b.cabinet)) put("cabinet", b.cabinet);
    if (sets.length) await run(`UPDATE herd.documents SET ${sets.join(", ")} WHERE id = ?`, ...vals, id);
    res.json(await get(`SELECT ${COLS} FROM herd.documents WHERE id = ?`, id));
  });
  app.delete("/api/documents/:id", async (req, res) => {
    const id = Number(req.params.id);
    await run("DELETE FROM herd.document_shares WHERE doc_id = ?", id);
    await run("DELETE FROM herd.document_chunks WHERE doc_id = ?", id);
    await run("DELETE FROM herd.documents WHERE id = ?", id);
    res.json({ ok: true });
  });
  // A link to send by text or email; anyone with it can open the file for 7 days
  app.post("/api/documents/:id/share", async (req, res) => {
    const id = Number(req.params.id);
    if (!(await get("SELECT id FROM herd.documents WHERE id = ? AND ready = true", id))) return res.status(404).json({ message: "Not found" });
    const token = randomBytes(18).toString("base64url");
    const r: any = await get("INSERT INTO herd.document_shares (token, doc_id, expires_at, created_by) VALUES (?, ?, now() + interval '7 days', ?) RETURNING expires_at AS \"expiresAt\"", token, id, req.user?.name ?? req.user?.email ?? null);
    res.json({ token, expiresAt: r.expiresAt });
  });
  // Opened from a shared link (no sign-in)
  const shared = async (token: string) => get<any>(`SELECT d.id, d.title, d.file_name AS "fileName", d.mime, d.size, d.chunks, s.expires_at AS "expiresAt" FROM herd.document_shares s JOIN herd.documents d ON d.id = s.doc_id WHERE s.token = ? AND s.expires_at > now() AND d.ready = true`, token);
  app.get("/api/public/doc/:token", async (req, res) => {
    const d = await shared(String(req.params.token));
    if (!d) return res.status(404).json({ message: "This link has expired or the document was removed." });
    const { id: _id, ...rest } = d; res.json(rest);
  });
  app.get("/api/public/doc/:token/chunk/:n", async (req, res) => {
    const d = await shared(String(req.params.token));
    if (!d) return res.status(404).json({ message: "Expired" });
    const r: any = await get("SELECT data FROM herd.document_chunks WHERE doc_id = ? AND n = ?", d.id, Number(req.params.n));
    if (!r) return res.status(404).json({ message: "Not found" });
    res.json({ data: r.data });
  });
}
