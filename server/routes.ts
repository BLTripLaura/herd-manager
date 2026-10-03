import express, { type Express } from "express";
import { ensureSetup } from "./bootstrap";
import type { Server } from "node:http";
import { scanPapers } from "./scan-papers";
import { storage, resources, settings, type ResourceName } from "./storage";
import { runBackup, listBackups, backupWorkbook, backupData } from "./backups";
import { registerAuth } from "./auth";
import { registerAudit } from "./audit";
import { herdInfo, snapshot, switchTo, restore, activeHerd } from "./herds";
import { checkRows, IMPORT_FIELDS } from "./import-match";

const isRes = (r: string): r is ResourceName => r in resources;

function toCsv(rows: any[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const { ownerOnly } = registerAuth(app);
  registerAudit(app, ownerOnly);
  // First request after a deploy: make sure the kid program product is in the medicine list
  try { await ensureSetup(); } catch (e) { console.error("first-time setup failed; will retry", e); }
  void storage.ensureCalfPro().catch(() => {});

  // Scheduled nightly copy (Vercel calls this about 2:00 AM Eastern with its secret)
  app.get("/api/cron/backup", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    // Without a CRON_SECRET setting, accept Vercel's own scheduler (a backup is harmless to run)
    const ok = secret ? req.headers.authorization === `Bearer ${secret}` : String(req.headers["user-agent"] || "").startsWith("vercel-cron/");
    if (!ok) return res.status(401).json({ message: "Not allowed" });
    res.json({ saved: await runBackup() });
  });
  // Backups: nightly copies and a one-file Excel of every record
  app.get("/api/backups", async (_req, res) => res.json({ backups: await listBackups(), keep: 30, time: "2:00 AM Eastern" }));
  app.post("/api/backups/run", async (_req, res) => { const name = await runBackup(); res.json({ name, backups: await listBackups() }); });
  const sendXlsx = (res: any, name: string, buf: Buffer) => {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${name}.xlsx"`);
    res.send(buf);
  };
  app.get("/api/backups/excel", async (_req, res) => {
    const d = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    sendXlsx(res, `goat-joy-herd-backup-${d}`, await backupWorkbook());
  });
  app.get("/api/backups/file/:date", async (req, res) => {
    const date = String(req.params.date).replace(/^goat-joy-herd-/, "").replace(/\.(db|xlsx)$/, "");
    const data = /^\d{4}-\d{2}-\d{2}$/.test(date) ? await backupData(date) : null;
    if (!data) return res.status(404).send("Not found");
    sendXlsx(res, `goat-joy-herd-${date}`, await backupWorkbook({ date, data }));
  });

  // Refresh the demo herd from its saved copy with dates moved up to today (only while the demo is open)
  app.post("/api/admin/sample", ownerOnly, async (_req, res) => {
    if ((await activeHerd()) !== "demo") return res.status(400).json({ message: "Open the demo herd first." });
    await restore("demo", true); res.json({ ok: true });
  });
  // My herd / Demo herd
  app.get("/api/herds", async (_req, res) => res.json(await herdInfo()));
  app.post("/api/herds/save-demo", ownerOnly, async (_req, res) => { await snapshot("demo"); res.json(await herdInfo()); });
  app.post("/api/herds/switch", ownerOnly, async (req, res) => {
    try { res.json(await switchTo(req.body?.to === "demo" ? "demo" : "mine")); } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  // First-time setup: keep what's here as the demo, then start My herd empty
  app.post("/api/herds/start-mine", ownerOnly, async (_req, res) => {
    await snapshot("demo"); await storage.clearAll(); await settings.set("activeHerd", "mine"); await snapshot("mine");
    res.json(await herdInfo());
  });
  // Photos
  app.get("/api/animals/:id/photos", async (req, res) => res.json(await storage.listPhotos(Number(req.params.id))));
  app.get("/api/photo-thumbs", async (req, res) => {
    const ids = String(req.query.ids ?? "").split(",").map(Number).filter(Boolean).slice(0, 1000);
    res.json(Object.fromEntries((await storage.photoThumbs(ids)).map((p) => [p.id, p.thumb])));
  });
  app.get("/api/photos/:id", async (req, res) => {
    const p = await storage.photoFull(Number(req.params.id));
    if (!p) return res.status(404).json({ message: "Photo not found" });
    res.json({ full: p.full });
  });
  app.post("/api/animals/:id/photos", async (req, res) => {
    const { full, thumb, mini, caption, date, makeProfile } = req.body ?? {};
    const ok = (x: any) => typeof x === "string" && x.startsWith("data:image/") && x.length < 8_000_000;
    if (!ok(full) || !ok(thumb)) return res.status(400).json({ message: "That file isn't a supported photo." });
    res.json(await storage.addPhoto({ animalId: Number(req.params.id), date: date || new Date().toISOString().slice(0, 10), caption, full, thumb, mini: ok(mini) ? mini : null }, !!makeProfile));
  });
  app.patch("/api/photos/:id", async (req, res) => {
    if (req.body?.makeProfileFor) await storage.update("animals", Number(req.body.makeProfileFor), { photoId: Number(req.params.id) });
    if ("caption" in (req.body ?? {})) await storage.updatePhoto(Number(req.params.id), req.body.caption || null);
    res.json({ ok: true });
  });
  app.delete("/api/photos/:id", async (req, res) => { await storage.deletePhoto(Number(req.params.id)); res.json({ ok: true }); });

  // Registration papers: stored photos of the certificate, and reading one with AI
  app.get("/api/animals/:id/papers", async (req, res) => res.json(await storage.listPapers(Number(req.params.id))));
  app.get("/api/papers/:id", async (req, res) => {
    const p = await storage.paperFull(Number(req.params.id));
    if (!p) return res.status(404).json({ message: "Paper not found" });
    res.json({ full: p.full });
  });
  const okImg = (x: any) => typeof x === "string" && x.startsWith("data:image/") && x.length < 12_000_000;
  app.post("/api/animals/:id/papers", async (req, res) => {
    const { full, thumb, label, date } = req.body ?? {};
    if (!okImg(full) || !okImg(thumb)) return res.status(400).json({ message: "That file isn't a supported photo." });
    res.json(await storage.addPaper({ animalId: Number(req.params.id), date: date || new Date().toISOString().slice(0, 10), label, full, thumb }));
  });
  app.patch("/api/papers/:id", async (req, res) => { await storage.updatePaper(Number(req.params.id), req.body?.label || null); res.json({ ok: true }); });
  app.delete("/api/papers/:id", async (req, res) => { await storage.deletePaper(Number(req.params.id)); res.json({ ok: true }); });
  app.post("/api/papers/scan", async (req, res) => {
    const imgs = (Array.isArray(req.body?.images) ? req.body.images : []).filter(okImg).slice(0, 2);
    if (!imgs.length) return res.status(400).json({ message: "Add a photo of the papers first." });
    try { res.json(await scanPapers(imgs)); }
    catch (e: any) {
      if (e?.noKey) return res.status(503).json({ message: "Reading papers isn't switched on yet (it needs an AI service key). Fill in the details by hand for now." });
      console.error("scan failed", e?.message);
      res.status(502).json({ message: "The papers couldn't be read. Try a clearer, flat photo in good light, or fill in the details by hand." });
    }
  });
  /** Save a reviewed scan: update or create the goat, merge the pedigree, keep the paper photos */
  app.post("/api/papers/apply", async (req, res) => {
    const { animalId, data = {}, ancestors = {}, notes, images = [] } = req.body ?? {};
    const allowed = ["name", "regNumber", "herdbook", "breed", "sex", "dob", "color", "eyeColor", "earType", "tattooRight", "tattooLeft", "tattooLocation", "microchip", "hornStatus", "sire", "dam"];
    const set: any = {};
    for (const k of allowed) if (typeof data[k] === "string" && data[k].trim()) set[k] = data[k].trim();
    if (set.microchip) { const d = set.microchip.replace(/\D/g, ""); if (d.length === 15) set.microchip = d; else delete set.microchip; }
    const paths = ["S", "D", "SS", "SD", "DS", "DD", "SSS", "SSD", "SDS", "SDD", "DSS", "DSD", "DDS", "DDD"];
    let id = Number(animalId) || 0;
    const cur: any = id ? (await storage.list("animals")).find((a: any) => a.id === id) : null;
    if (id && !cur) return res.status(404).json({ message: "Goat not found" });
    let ped: Record<string, any> = {};
    try { ped = cur?.pedigree ? JSON.parse(cur.pedigree) : {}; } catch {}
    for (const p of paths) {
      const e = ancestors[p];
      if (e && (e.name || e.reg)) ped[p] = { name: e.name || undefined, reg: e.reg || undefined, extra: e.extra || undefined };
    }
    set.pedigree = JSON.stringify(ped);
    if (notes && String(notes).trim()) set.notes = [cur?.notes, String(notes).trim()].filter(Boolean).join("\n");
    if (!id) {
      if (!set.name) return res.status(400).json({ message: "The goat needs a registered name." });
      const p = resources.animals.schema.safeParse({ sex: "doe", ...set });
      if (!p.success) return res.status(400).json({ message: p.error.message });
      id = (await storage.create("animals", { ...p.data, cdtFromBirth: false } as any)).id;
    } else await storage.update("animals", id, set);
    let saved = 0;
    for (const im of Array.isArray(images) ? images.slice(0, 4) : []) {
      if (okImg(im?.full) && okImg(im?.thumb)) { await storage.addPaper({ animalId: id, date: new Date().toISOString().slice(0, 10), label: im.label ?? null, full: im.full, thumb: im.thumb }); saved++; }
    }
    await storage.tidyParents();
    res.json({ id, created: !cur, papers: saved });
  });

  app.get("/api/settings/:key", async (req, res) => res.json({ value: await settings.get(req.params.key) }));
  app.put("/api/settings/:key", async (req, res) => res.json({ value: await settings.set(req.params.key, req.body?.value ?? null) }));
  app.post("/api/admin/clear", ownerOnly, async (_req, res) => { if (await settings.get("activeHerd") !== "demo") await snapshot("mine-before-erase"); await storage.clearAll(); res.json({ ok: true }); });

  app.get("/api/export/:resource", async (req, res) => {
    const r = req.params.resource;
    if (!isRes(r)) return res.status(404).json({ message: "Unknown" });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="herd-${r}.csv"`);
    res.send(toCsv(await storage.list(r)));
  });

  // Report download: the browser posts the table it is showing; we send back .xlsx or .csv
  app.post("/api/report-file", async (req, res) => {
    let body: any;
    try { body = typeof req.body?.payload === "string" ? JSON.parse(req.body.payload) : req.body; } catch { return res.status(400).send("Bad report"); }
    const sheets: { name: string; columns: { label: string; kind: string }[]; rows: any[][] }[] = body?.sheets ?? [];
    const base = String(body?.filename || "goat-joy-report").replace(/[^\w.-]+/g, "-");
    if (!sheets.length) return res.status(400).send("Nothing to export");
    if (body.format === "csv") {
      const esc = (v: any) => { const x = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
      const sh = sheets[0];
      const csv = [sh.columns.map((c) => c.label), ...sh.rows].map((r) => r.map(esc).join(",")).join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.csv"`);
      return res.send("\ufeff" + csv); // BOM so Excel reads it cleanly
    }
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Herd Manager";
    const used = new Set<string>();
    for (const sh of sheets) {
      let name = (sh.name || "Report").replace(/[\\/?*:[\]]/g, " ").slice(0, 31);
      while (used.has(name)) name = name.slice(0, 29) + " " + used.size;
      used.add(name);
      const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
      ws.columns = sh.columns.map((c) => ({ header: c.label, key: c.label, width: Math.min(40, Math.max(c.label.length + 4, c.kind === "date" ? 12 : 10)) }));
      for (const r of sh.rows) {
        ws.addRow(r.map((v, i) => {
          const k = sh.columns[i]?.kind;
          if (v === null || v === undefined || v === "") return null;
          if (k === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) { const [y, m, d] = String(v).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
          if (k === "num" && !isNaN(Number(v))) return Number(v);
          return v;
        }));
      }
      sh.columns.forEach((c, i) => {
        const col = ws.getColumn(i + 1);
        if (c.kind === "date") col.numFmt = "mmm d, yyyy";
        let w = c.label.length + 4;
        col.eachCell({ includeEmpty: false }, (cell) => { w = Math.max(w, Math.min(45, String(cell.text ?? "").length + 2)); });
        col.width = w;
      });
      const head = ws.getRow(1);
      head.font = { bold: true, color: { argb: "FFFFFFFF" } };
      head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B2A55" } };
      if (sh.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sh.columns.length } };
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${base}.xlsx"`);
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  });

  /* ---------- Bulk import ---------- */
  const cellText = (v: any): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") {
      if ("result" in v) return cellText(v.result);
      if ("text" in v) return String(v.text);
      if ("richText" in v) return v.richText.map((t: any) => t.text).join("");
      if ("hyperlink" in v) return String(v.hyperlink);
      return "";
    }
    return String(v);
  };

  // Read an Excel workbook sent as raw bytes; returns rows of text for the chosen sheet
  app.post("/api/import/parse", express.raw({ type: () => true, limit: "25mb" }), async (req, res) => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.body as any);
      const sheets = wb.worksheets.map((w) => w.name);
      const idx = Math.min(Number(req.query.sheet) || 0, wb.worksheets.length - 1);
      const ws = wb.worksheets[idx];
      const rows: string[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const out: string[] = [];
        for (let c = 1; c <= ws.columnCount; c++) out.push(cellText(row.getCell(c).value).trim());
        if (out.some((x) => x)) rows.push(out);
      });
      res.json({ sheets, sheet: idx, rows });
    } catch {
      res.status(400).json({ message: "That file couldn't be read as an Excel workbook (.xlsx). Older .xls files: open in Excel and Save As .xlsx, or save as CSV." });
    }
  });

  // Fetch a Google Sheet as CSV (sheet must be shared "Anyone with the link")
  app.post("/api/import/sheet-url", async (req, res) => {
    const url = String(req.body?.url || "").trim();
    const m = url.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
    if (!m) return res.status(400).json({ message: "That doesn't look like a Google Sheets link. Copy the link from the address bar of your sheet." });
    const gid = url.match(/[#&?]gid=(\d+)/)?.[1];
    const csvUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
    try {
      const r = await fetch(csvUrl, { redirect: "follow" });
      const type = r.headers.get("content-type") || "";
      if (!r.ok || type.includes("text/html")) throw new Error("private");
      res.json({ text: await r.text() });
    } catch {
      res.status(400).json({ message: "Google wouldn't share that sheet. In Google Sheets, click Share → General access → \"Anyone with the link\" (Viewer), then try again. Or use File → Download → CSV and upload that." });
    }
  });

  // Look for goats already in the app before importing
  app.post("/api/import/check", async (req, res) => {
    const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    res.json(await checkRows(rows));
  });

  // Create goats, or merge rows into goats already in the app.
  // Each row: { data, action: "new" | "merge" | "skip", matchId, replace }. Merging only fills blanks
  // (and adds new notes) unless replace is set, so later imports add missing details without undoing edits.
  app.post("/api/import/animals", async (req, res) => {
    const items: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const today = new Date().toISOString().slice(0, 10);
    const norm = (x: any) => String(x ?? "").trim().toLowerCase();
    const blank = (v: any) => v === null || v === undefined || String(v).trim() === "";
    const pastures = await storage.list("pastures");
    const byPasture = new Map(pastures.map((p: any) => [norm(p.name), p.id]));
    const result = { created: 0, updated: 0, filled: 0, unchanged: 0, skipped: 0, pasturesCreated: [] as string[], errors: [] as string[] };
    const pastureFor = async (name: any) => {
      if (blank(name)) return undefined;
      const key = norm(name);
      if (!byPasture.has(key)) { const p = await storage.create("pastures", { name: String(name).trim(), acres: null, notes: null }); byPasture.set(key, p.id); result.pasturesCreated.push(p.name); }
      return byPasture.get(key);
    };
    try {
      await storage.transaction(async () => {
        for (let i = 0; i < items.length; i++) { const it = items[i];
          const r = it?.data ?? it; const action = it?.action ?? "new";
          if (action === "skip" || !r?.name && action === "new") { result.skipped++; continue; }
          const data: any = {};
          for (const f of IMPORT_FIELDS) if (!blank(r[f])) data[f] = r[f];
          if (action === "merge") {
            const match: any = (await storage.list("animals")).find((a: any) => a.id === Number(it.matchId));
            if (!match) { result.errors.push(`Row ${it.row ?? i + 2}: the matching goat no longer exists`); result.skipped++; continue; }
            const upd: any = {};
            for (const [f, v] of Object.entries(data)) {
              if (f === "notes") { if (blank(match.notes)) upd.notes = v; else if (!norm(match.notes).includes(norm(v))) upd.notes = `${match.notes}\n${v}`; }
              else if (blank(match[f]) || (it.replace && norm(match[f]) !== norm(v))) upd[f] = v;
            }
            const pid = await pastureFor(r.pasture);
            if (pid && pid !== match.pastureId && (!match.pastureId || it.replace)) {
              upd.pastureId = pid;
              await storage.create("pastureMoves", { animalId: match.id, fromPastureId: match.pastureId ?? null, toPastureId: pid, date: today });
            }
            const milkChange = it.replace && r.inMilk !== undefined && !!r.inMilk !== !!match.inMilk;
            if (!Object.keys(upd).length && !milkChange) { result.unchanged++; continue; }
            if (Object.keys(upd).length) await storage.update("animals", match.id, upd);
            if (milkChange) await storage.setMilkStatus(match.id, r.inMilk ? "milking" : "dry", today);
            if (it.replace) result.updated++; else result.filled++;
          } else {
            const pid = await pastureFor(r.pasture);
            const p = resources.animals.schema.safeParse({ sex: "doe", status: "active", ...data, pastureId: pid ?? null });
            if (!p.success) { result.errors.push(`Row ${it.row ?? i + 2} (${r.name}): ${p.error.issues[0]?.message}`); result.skipped++; continue; }
            let a = await storage.create("animals", { ...p.data, cdtFromBirth: false }); // imported goats: CD&T reminders start from a CD&T date, not birth
            if (r.inMilk) a = await storage.setMilkStatus(a.id, "milking", today);
            if (pid) await storage.create("pastureMoves", { animalId: a.id, fromPastureId: null, toPastureId: pid, date: today });
            result.created++;
          }
        }
      });
      // Parents listed by barn name, tattoo or reg # are stored as registered names (also links kids whose parents came later in the file)
      (result as any).parentsLinked = await storage.tidyParents();
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message || "Import failed" });
    }
  });

  // Treatments (one or many): creates records, deducts inventory, schedules repeat-dose tasks
  app.post("/api/treatments/batch", async (req, res) => {
    const body = req.body ?? {};
    const rows = Array.isArray(body) ? body : Array.isArray(body.treatments) ? body.treatments : [];
    const parsed = rows.map((r: any) => resources.treatments.schema.safeParse(r));
    const bad = parsed.find((p: any) => !p.success);
    if (bad && !bad.success) return res.status(400).json({ message: bad.error.message });
    res.json(await storage.logTreatments(parsed.map((p: any) => p.data), body.repeat));
  });

  // Breedings: straw deduction for AI
  app.post("/api/breedings/save", async (req, res) => {
    const { id, doeInMilk, ...rest } = req.body ?? {};
    const p = resources.breedings.schema.safeParse(rest);
    if (!p.success) return res.status(400).json({ message: p.error.message });
    try {
      const saved = await storage.saveBreeding(p.data, id ? Number(id) : undefined);
      // Recording a birth: the doe freshens, so her new lactation (days in milk) starts on the kidding date
      if (saved.status === "kidded" && doeInMilk && saved.kiddingDate) await storage.setMilkStatus(saved.doeId, "milking", saved.kiddingDate, true);
      res.json(saved);
    }
    catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/animals/:id/milk-status", async (req, res) => {
    const { status, date, fresh } = req.body ?? {};
    if (status !== null && !["milking", "mastitis", "drying", "dry"].includes(status)) return res.status(400).json({ message: "Unknown milk status" });
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? String(date) : new Date().toISOString().slice(0, 10);
    try { res.json(await storage.setMilkStatus(Number(req.params.id), status, d, !!fresh)); }
    catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/breedings/:id/prekid", async (req, res) => {
    const date = String(req.body?.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "Pick a date" });
    try { res.json(await storage.givePrekid(Number(req.params.id), date, req.body?.givenBy)); }
    catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // Milk tests: up to 2 test days a month, 3 milk-outs per doe per test
  app.post("/api/milk/test", async (req, res) => {
    const { date, rows, merge } = req.body ?? {};
    if (!Array.isArray(rows)) return res.status(400).json({ message: "rows required" });
    try { res.json(await storage.saveMilkTest(String(date || ""), rows.map((r: any) => ({ ...r, animalId: Number(r.animalId) })), !!merge)); }
    catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/milk/test/:date", async (req, res) => { await storage.deleteMilkTest(req.params.date); res.json({ ok: true }); });

  app.post("/api/tasks/:id/give", async (req, res) => {
    try {
      const date = typeof req.body?.date === "string" && req.body.date ? req.body.date : new Date().toISOString().slice(0, 10);
      res.json(await storage.giveDose(Number(req.params.id), date, req.body?.givenBy, req.body?.skipIds ?? [], req.body?.temps ?? {}, typeof req.body?.time === "string" ? req.body.time : null, req.body?.doses ?? {}, req.body?.weights ?? {}, { stopAfter: !!req.body?.stopAfter, note: typeof req.body?.note === "string" ? req.body.note : null }));
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/tasks/:id/skip", async (req, res) => {
    try { res.json(await storage.skipDose(Number(req.params.id))); } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.post("/api/tasks/:id/stop", async (req, res) => {
    try { res.json(await storage.stopDoses(Number(req.params.id), Array.isArray(req.body?.animalIds) ? req.body.animalIds : null)); } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/animals/move", async (req, res) => {
    const { ids, pastureId, date } = req.body ?? {};
    if (!Array.isArray(ids)) return res.status(400).json({ message: "ids required" });
    const pid = pastureId === null || pastureId === undefined ? null : Number(pastureId);
    const d = typeof date === "string" && date ? date : new Date().toISOString().slice(0, 10);
    res.json(await storage.moveAnimals(ids.map(Number), pid, d));
  });
  app.post("/api/animals/move/undo", async (req, res) => {
    const ids = Array.isArray(req.body?.moveIds) ? req.body.moveIds.map(Number) : [];
    await storage.undoMoves(ids);
    res.json({ ok: true });
  });

  app.get("/api/:resource", async (req, res) => {
    const r = req.params.resource;
    if (!isRes(r)) return res.status(404).json({ message: "Unknown" });
    res.json(await storage.list(r));
  });

  app.post("/api/:resource/bulk", async (req, res) => {
    const r = req.params.resource;
    if (!isRes(r)) return res.status(404).json({ message: "Unknown" });
    const rows = Array.isArray(req.body) ? req.body : [];
    const parsed = rows.map((row) => resources[r].schema.safeParse(row));
    const bad = parsed.find((p) => !p.success);
    if (bad && !bad.success) return res.status(400).json({ message: bad.error.message });
    res.json(await storage.createMany(r, parsed.map((p: any) => p.data)));
  });

  app.post("/api/:resource", async (req, res) => {
    const r = req.params.resource;
    if (!isRes(r)) return res.status(404).json({ message: "Unknown" });
    const p = resources[r].schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: p.error.message });
    const created = await storage.create(r, p.data);
    if (r === "animals") await storage.tidyParents(); // kids that already named this goat by barn name now point to it
    if (r === "animals" && (created.milkStatus || created.inMilk)) return res.json(await storage.setMilkStatus(created.id, created.milkStatus || "milking", created.milkStatusDate || new Date().toISOString().slice(0, 10)));
    if (r === "treatments" && created.medicationId && created.doseMl) await storage.adjustStock(created.medicationId, -created.doseMl);
    res.json(created);
  });

  app.patch("/api/:resource/:id", async (req, res) => {
    const r = req.params.resource;
    if (!isRes(r)) return res.status(404).json({ message: "Unknown" });
    if (r === "animals" && req.body && ("milkStatus" in req.body || "inMilk" in req.body)) {
      // Milk status changes go through lactation tracking so days in milk stay right
      const { milkStatus, inMilk, milkStatusDate, ...rest } = req.body;
      const id = Number(req.params.id);
      const cur: any = (await storage.list("animals")).find((a: any) => a.id === id);
      if (Object.keys(rest).length) await storage.update(r, id, rest);
      const next = "milkStatus" in req.body ? milkStatus ?? null : inMilk ? (cur?.inMilk ? cur.milkStatus ?? "milking" : "milking") : cur?.inMilk ? "dry" : cur?.milkStatus ?? null;
      if (next !== (cur?.milkStatus ?? null)) return res.json(await storage.setMilkStatus(id, next, milkStatusDate || new Date().toISOString().slice(0, 10)));
      return res.json((await storage.list("animals")).find((a: any) => a.id === id));
    }
    res.json(await storage.update(r, Number(req.params.id), req.body));
  });

  app.delete("/api/:resource/:id", async (req, res) => {
    const r = req.params.resource;
    if (!isRes(r)) return res.status(404).json({ message: "Unknown" });
    await storage.remove(r, Number(req.params.id));
    res.json({ ok: true });
  });

  return httpServer;
}
