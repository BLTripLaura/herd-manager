/* EasyKeeper → Herd Manager: complete record import.
   The EasyKeeper reader (client/public/easykeeper-reader.js) saves every goat's EasyKeeper pages into one file.
   The Getting started page sends that file here a few goats at a time (so it fits in a request) and then calls /finish.

   Where each EasyKeeper record lands
   ───────────────────────────────────
   Profile + Edit Info ............ the goat: name, nickname, sex, breed, herdbook, birth date, tattoos, microchip,
                                    eye/ear/horn, colors, registration #, private description (Notes)
   Registrations .................. Reg # (primary), ADGA Genetics link built from the ADGA number; others in Notes
   Genetics → sire/dam ............ Sire / Dam; grandparents → Pedigree (ancestors not in the herd)
   Genetics → progeny ............. Progeny tab: kids in the import are linked by Sire/Dam; kids EasyKeeper lists but
                                    that never belonged to this herd are kept in "Other progeny recorded in EasyKeeper"
   Health → History
     Medication, Parasite Control,
     Vaccination, Supplements ..... Treatment history (historical: medicine stock is NOT deducted, no new reminders)
     Weight ....................... Weights
     Body Condition Score, Test ... Care records with the score/result
     Maintenance & everything else  Care records (hoof work → "Hoof trim", weaning, udder checks…)
   Health → Scheduled events ...... Reminders (open-ended, repeating like EasyKeeper; due date kept)
   Breeding ....................... Breeding records (service + kidding joined into one record), heats
   Notes .......................... Goat notes with the original date and initials
   Status ......................... Status (active / sold / deceased), date, buyer, price, cause of death; full
                                    status history saved as notes
   Photos ......................... Photos (copied into Herd Manager by the page, see /photo below)
   Milk (lactations) / Harvest .... Lactations and notes
   Re-importing the same file never doubles anything: every record is matched by its EasyKeeper id or its date + text. */
import type { Express, Request, Response, NextFunction } from "express";
import { storage, settings, resources, type ResourceName } from "./storage";
import { db, all, run, tx } from "./db";
import { activeHerd } from "./herds";

/** Many rows at once (a goat can have hundreds of EasyKeeper health records) */
async function insertMany(r: ResourceName, rows: any[]) {
  for (let i = 0; i < rows.length; i += 300) await db.insert(resources[r].table as any).values(rows.slice(i, i + 300));
}

type Table = { heading: string; id: string; cls: string; headers: string[]; rows: Row[] };
type Row = { cells: string[][]; titles: string[]; sort: string[]; links: string[]; id: string };
type EKAnimal = {
  ekId: string;
  list?: { name?: string; reg?: string; sex?: string; dob?: string; status?: string };
  profile?: { lines: string[]; header?: string };
  edit?: Record<string, any>;
  progeny?: Row[];
  pedigree?: { code: string; name: string; ekId: string; lines: string[] }[];
  health?: Table[];
  healthDetails?: Record<string, { route?: string; dosage?: string; notes?: string; category?: string }>;
  breedings?: Table[];
  notes?: Table[];
  status?: Table[];
  photos?: { id: string; url: string; thumb?: string; title?: string }[];
  lactations?: Table[];
  lactationDetails?: Record<string, { lines: string[]; tables: Table[] }>;
  harvest?: Table[];
};

/* ---------- small helpers ---------- */
const S = (x: any) => String(x ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** "09/29/2026", "06/09/26", "09/29/2026 7:43 AM", "February 28, 2013" → "2026-09-29" */
export function isoDate(x: any): string | null {
  const s = S(x);
  let m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let y = Number(m[3]); if (y < 100) y += y > 50 ? 1900 : 2000;
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) { const mo = MONTHS.indexOf(m[1].toLowerCase()); if (mo >= 0) return `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
const todayISO = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const col = (t: Table, re: RegExp) => t.headers.findIndex((h) => re.test(h));
const cell = (r: Row, i: number) => (i >= 0 ? r.cells[i] ?? [] : []);
/** A cell's full text: EasyKeeper shortens long notes in the table and keeps the whole note in the title */
const fullText = (r: Row, i: number) => (i < 0 ? "" : S(r.titles[i]) || cell(r, i).join(" ").trim());
const idIn = (links: string[], re: RegExp) => { for (const l of links) { const m = l.match(re); if (m) return m[1]; } return null; };
const norm = (s: any) => S(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** ADGA registration "PB1652357" / "AB2392602" / "D2126253" → ADGA Genetics link (breed letter + 9-digit number) */
export function adgaUrl(reg: any): string | null {
  const s = S(reg).toUpperCase().replace(/\s+/g, "");
  let m = s.match(/^([A-Z])(\d{9})$/);
  if (m) return `https://genetics.adga.org/PedigreePrint.aspx?RegNumber=${m[1]}${m[2]}`;
  m = s.match(/^[A-Z]{0,2}?([A-Z])(\d{4,8})$/);
  if (!m) return null;
  return `https://genetics.adga.org/PedigreePrint.aspx?RegNumber=${m[1]}${m[2].padStart(9, "0")}`;
}

/** Profile page lines → { "Full name": "...", "Registration/Id #(s)": [..] } */
function profileFields(lines: string[] = []) {
  const out: Record<string, string[]> = {};
  let cur: string | null = null;
  for (const l of lines) {
    // Section headings on the profile page, not values
    if (/^(Vital Information|Identifying Information|Description|Status\/Ownership|Genetic Information|Other Information|Notes)$/i.test(S(l))) { cur = null; continue; }
    const m = l.match(/^([A-Za-z][A-Za-z /&#()'.-]{1,45}):\s*(.*)$/);
    if (m && !/^(ADGA|AGS|ADGA DNA|NDHIA|NDGA|AMGRA|NDGA|CGS|MDGA|IDGR|TOGGS|ANGRA|AGS|NPGA|ABGA|USDA|Number|Placement|RE|LE|RT|LT|CT)$/i.test(m[1])) {
      cur = m[1].trim(); out[cur] = m[2] ? [m[2].trim()] : []; continue;
    }
    if (cur) out[cur].push(l);
  }
  return out;
}
/** "ADGA: PB1652357 [Primary]" lines → [{org, num, primary}] */
function registrations(lines: string[] = []) {
  return lines.map((l) => l.match(/^([A-Za-z][A-Za-z .&-]{1,20}):\s*([A-Za-z0-9-]+)\s*(\[Primary\])?/)).filter(Boolean)
    .map((m) => ({ org: m![1].trim(), num: m![2].trim(), primary: !!m![3] }));
}

/* ---------- one goat's profile ---------- */
function mapAnimal(a: EKAnimal) {
  const e = a.edit ?? {};
  const f = (k: string) => { const v = e[`herd_animal[${k}]`]; const s = S(v); return !s || /^-+\s*select/i.test(s) ? "" : s; };
  const p = profileFields(a.profile?.lines);
  const pv = (k: string) => S((p[k] ?? []).join(" "));
  const regs = registrations(p["Registration/Id #(s)"] ?? []);
  const primary = regs.find((r) => r.primary) ?? regs[0];
  const adga = regs.find((r) => /^ADGA$/i.test(r.org));
  const registered = f("registered_name") || pv("Full name") || S(a.list?.name);
  const nick = f("nickname") || pv("Barn/Nickname");
  const gender = (f("gender") || pv("Sex") || S(a.list?.sex)).toLowerCase();
  const castrated = e["herd_animal[castrated]"] === true || /wether/.test(gender);
  const sex = /female|doe/.test(gender) ? "doe" : castrated ? "wether" : /male|buck/.test(gender) ? "buck" : "doe";
  const horn = (f("horn_type") || pv("Horn Type")).toLowerCase();
  const hornStatus = /poll/.test(horn) ? "polled" : /scur/.test(horn) ? "scurs" : /horn/.test(horn) && !/disbud|dehorn/.test(horn) ? "horned" : horn ? "disbudded" : undefined;
  const tattooPlace = (f("tattoo_placement") || "").toLowerCase();
  const tail = /tail/.test(tattooPlace);
  const chipPlace = (f("electronic_id_location") || "").toLowerCase();
  const ped: Record<string, { name: string; reg?: string; extra?: string }> = {};
  let sire: string | null = null, dam: string | null = null;
  for (const x of a.pedigree ?? []) {
    const name = S(x.name) || S(x.lines?.[0]);
    if (!name || /^undefined$/i.test(name)) continue;
    const r = registrations(x.lines);
    const reg = (r.find((y) => /^ADGA$/i.test(y.org)) ?? r[0])?.num;
    const extra = (x.lines ?? []).filter((l) => /^(Breed|DOB|Eye Color):/i.test(l)).join(" · ");
    if (x.code === "S") sire = name; else if (x.code === "D") dam = name;
    ped[x.code] = { name, ...(reg ? { reg } : {}), ...(extra ? { extra } : {}) };
  }
  // Status/Ownership on the profile + the most recent row of the Status tab
  const st = (S(a.list?.status) || pv("Status")).toLowerCase();
  const status = /sold|cull|returned|leased in.*ended/.test(st) ? "sold" : /deceased|died|dead|harvest|slaughter|stillborn/.test(st) ? "deceased" : "active";
  let statusDate: string | null = null, buyerName: string | null = null, salePrice: number | null = null, deathCause: string | null = null;
  const stT = (a.status ?? []).find((t) => t.headers.some((h) => /status/i.test(h)));
  if (stT) {
    const cD = col(stT, /date/i), cS = col(stT, /status/i), cDet = col(stT, /detail/i), cN = col(stT, /note/i);
    const rows = stT.rows.map((r) => ({ date: isoDate(cell(r, cD).join(" ")), st: S(cell(r, cS).join(" ")), det: fullText(r, cDet), note: fullText(r, cN) }))
      .sort((x, y) => String(y.date).localeCompare(String(x.date)));
    const lastMatch = rows.find((r) => (status === "sold" ? /sold|cull|return/i : status === "deceased" ? /deceased|died|harvest|slaughter|stillborn/i : /./).test(r.st)) ?? rows[0];
    if (lastMatch && status !== "active") {
      statusDate = lastMatch.date;
      if (status === "sold") {
        const price = lastMatch.det.match(/\$\s*([\d,]+(?:\.\d+)?)/); if (price) { const n = Number(price[1].replace(/,/g, "")); if (n > 0) salePrice = n; }
        const to = lastMatch.det.match(/\bto\s+(.+)$/i); buyerName = to ? S(to[1]) : S(lastMatch.det.replace(/\$\s*[\d,.]+\s*[•·-]?/, "")) || null;
      } else deathCause = [lastMatch.det, lastMatch.note].filter(Boolean).join(" — ") || (/stillborn/i.test(lastMatch.st) ? "Stillborn" : null);
    }
  }
  const notes: string[] = [];
  const priv = f("private_description") || pv("Description"); if (priv) notes.push(priv);
  const other = regs.filter((r) => r !== primary).map((r) => `${r.org}: ${r.num}`); if (other.length) notes.push(`Other registrations: ${other.join(", ")}`);
  const scrapie = f("usda_scrapie_tag") || pv("USDA Scrapie Certification Tag #"); if (scrapie) notes.push(`USDA scrapie tag: ${scrapie}`);
  const mouth = f("jaw_defect_id") || pv("Mouth"); if (mouth && !/^correct$/i.test(mouth)) notes.push(`Mouth: ${mouth}`);
  const conc = f("conception_type") || pv("Conception Type"); if (conc) notes.push(`Conception: ${conc}`);
  for (const k of ["Boarded For", "Boarded With", "Leased From", "Leased To", "Owner", "Breeder"]) if (pv(k)) notes.push(`${k}: ${pv(k)}`);
  if (/board|lease/.test(st)) notes.push(`EasyKeeper status: ${S(a.list?.status) || pv("Status")}`);
  const tag = ["id_tag", "id_tag_number", "scrapie_tag"].map(f).find(Boolean) || pv("Id Tag") || null;
  const breed = f("breed_id") || f("breed_name") || pv("Breed Type").replace(/^(Purebred|American|Experimental|Grade|Recorded Grade)\s+/i, "") || undefined;
  const herdbook = f("herdbook_id") || (pv("Breed Type").match(/^(Purebred|American|Experimental|Grade)/i)?.[1]) || undefined;
  const rec: any = {
    name: registered || nick || `EasyKeeper goat ${a.ekId}`,
    barnName: nick && norm(nick) !== norm(registered) ? nick : null,
    sex, breed, herdbook,
    dob: isoDate(f("born_on") || pv("Date of Birth") || a.list?.dob),
    regNumber: primary?.num || S(a.list?.reg) || null,
    pedigreeUrl: adgaUrl(adga?.num) ,
    color: f("colors_and_markings") || pv("Colors & Markings") || null,
    eyeColor: f("eye_color_id") || pv("Eye Color") || undefined,
    earType: f("ear_type") || pv("Ear Type") || null,
    hornStatus,
    tattooLocation: tail ? "tail" : "ear",
    tattooRight: (tail ? f("tattoo_rt") : f("tattoo_re")) || f("tattoo_re") || f("tattoo_rt") || null,
    tattooLeft: (tail ? f("tattoo_lt") : f("tattoo_le")) || f("tattoo_le") || f("tattoo_lt") || f("tattoo_ct") || null,
    microchip: f("electronic_id_number") || null,
    chipLocation: /tail/.test(chipPlace) ? "tail" : "ear",
    tag, sire, dam,
    pedigree: Object.keys(ped).length ? JSON.stringify(ped) : null,
    status, statusDate, buyerName, salePrice, deathCause,
    notes: notes.join("\n") || null,
    ekId: Number(a.ekId),
    cdtFromBirth: false,
  };
  for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];
  return rec;
}

/* ---------- matching an EasyKeeper goat to one already in Herd Manager ---------- */
function findExisting(rec: any, herd: any[]) {
  const by = (pred: (x: any) => boolean) => herd.find(pred);
  return by((x) => x.ekId && Number(x.ekId) === rec.ekId)
    ?? (rec.regNumber ? by((x) => !!norm(x.regNumber) && norm(x.regNumber) === norm(rec.regNumber)) : undefined)
    ?? (rec.microchip ? by((x) => !!norm(x.microchip) && norm(x.microchip) === norm(rec.microchip)) : undefined)
    ?? by((x) => norm(x.name) === norm(rec.name) && (!x.dob || !rec.dob || x.dob === rec.dob))
    ?? (rec.barnName ? by((x) => (norm(x.barnName) === norm(rec.barnName) || norm(x.name) === norm(rec.barnName)) && (!x.dob || !rec.dob || x.dob === rec.dob)) : undefined);
}

/* ---------- health history ---------- */
const TREAT_CATS = /medic|parasit|deworm|vaccin|supplement|vitamin|mineral|antibiot|treat/i;
/** "3 ml" → {ml:3}; "30 mg" → {mg:30}; "15.3mL" → {ml:15.3}; ".15" → {plain:".15"}; "Squirt" → {text:"Squirt"} */
function parseDose(t: string) {
  const s = S(t);
  if (!s) return {};
  let m = s.match(/^(\d*\.?\d+)\s*(ml|mls|cc|cc's|cm3)\b\.?(.*)$/i);
  if (m) return { ml: Number(m[1]), rest: S(m[3]) };
  m = s.match(/^(\d*\.?\d+)\s*mg\b\.?(.*)$/i);
  if (m) return { mg: Number(m[1]), rest: S(m[2]), text: `${m[1]} mg` };
  m = s.match(/^(\d*\.?\d+)$/);
  if (m) return { plain: m[1] };
  return { text: s };
}
function parseWeightLbs(t: string): number | null {
  const s = S(t).toLowerCase();
  const lb = s.match(/(\d*\.?\d+)\s*(lb|lbs|pound)/), oz = s.match(/(\d*\.?\d+)\s*oz/), kg = s.match(/(\d*\.?\d+)\s*kg/);
  if (kg) return Math.round(Number(kg[1]) * 2.20462 * 100) / 100;
  if (lb || oz) return Math.round(((lb ? Number(lb[1]) : 0) + (oz ? Number(oz[1]) / 16 : 0)) * 100) / 100;
  const n = s.match(/^(\d*\.?\d+)$/); return n ? Number(n[1]) : null;
}
function careKind(category: string, activity: string) {
  const a = activity.toLowerCase(), c = category.toLowerCase();
  if (/body condition|bcs/.test(c + " " + a)) return "Body condition";
  if (/famacha/.test(a)) return "FAMACHA";
  if (/hoof|trim|feet/.test(a)) return "Hoof trim";
  if (/wean/.test(a)) return "Weaning";
  if (/udder/.test(a)) return "Udder check";
  if (/fecal|faecal/.test(a)) return "Fecal sample";
  if (/temp/.test(a)) return "Temperature";
  if (/disbud/.test(a)) return "Disbudding";
  if (/tattoo/.test(a)) return "Tattoo";
  if (/band|castrat/.test(a)) return "Banding / castration";
  if (/clip|shav/.test(a)) return "Clipping / shaving";
  if (/cae|johne|cl\b|blood|bio.?track|pregnan.*blood/.test(a)) return "Blood draw (CAE, CL, Johne's)";
  if (/^test$/.test(c)) return activity || "Test";
  return "Maintenance";
}

/** Reminder "36 Days Overdue" / "Due in 3 days" / "Today" / a date → due date */
function dueFrom(t: string) {
  const s = S(t).toLowerCase(), today = todayISO();
  const iso = isoDate(s); if (iso) return iso;
  let m = s.match(/(\d+)\s*days?\s*overdue/); if (m) return addDays(today, -Number(m[1]));
  m = s.match(/(?:due\s*)?in\s*(\d+)\s*days?/); if (m) return addDays(today, Number(m[1]));
  m = s.match(/(\d+)\s*days?/); if (m) return addDays(today, Number(m[1]));
  if (/tomorrow/.test(s)) return addDays(today, 1);
  if (/yesterday/.test(s)) return addDays(today, -1);
  return today;
}

/* ---------- import one chunk of goats ---------- */
export async function importChunk(list: EKAnimal[], allEkIds: Set<string>, opts: { overwrite?: boolean }) {
  const report = { created: 0, updated: 0, treatments: 0, care: 0, weights: 0, reminders: 0, breedings: 0, heats: 0, notes: 0, lactations: 0, skipped: [] as string[] };
  const meds: any[] = await storage.list("medications");
  const medBy = (name: string) => { const n = norm(name); return meds.find((m) => norm(m.name) === n) ?? meds.find((m) => n.length > 3 && (norm(m.name).startsWith(n) || n.startsWith(norm(m.name)))); };
  const herd: any[] = await storage.list("animals");
  const idMap: Record<string, number> = {};

  for (const a of list) {
    try {
      await tx(async () => {
        const rec = mapAnimal(a);
        // Kids EasyKeeper lists as progeny but that were never in this herd: keep them on the parent
        const outside = (a.progeny ?? []).map((r) => {
          const kid = idIn(r.links, /herd_animals\/(\d+)/);
          if (kid && allEkIds.has(kid)) return null;
          const c = r.cells.map((x) => S(x.join(" ")));
          return { name: c[0] || "", reg: c[1] || null, sex: c[2] || null, dob: isoDate(c[3]) };
        }).filter((x) => x && x.name);
        rec.outsideProgeny = outside.length ? JSON.stringify(outside) : null;

        let g = findExisting(rec, herd);
        if (g) {
          // Fill blanks; never overwrite what the farm already typed unless asked
          const patch: any = {};
          for (const [k, v] of Object.entries(rec)) {
            if (v === null || v === undefined || v === "") continue;
            if (k === "notes") { if (!String(g.notes ?? "").includes(String(v))) patch.notes = [g.notes, v].filter(Boolean).join("\n"); continue; }
            const cur = (g as any)[k];
            if (opts.overwrite || cur === null || cur === undefined || cur === "" || (k === "status" && cur === "active" && v !== "active" && !g.ekId) || k === "ekId" || k === "outsideProgeny") patch[k] = v;
          }
          if (Object.keys(patch).length) g = await storage.update("animals", g.id, patch);
          report.updated++;
        } else {
          g = await storage.create("animals", rec);
          herd.push(g);
          report.created++;
        }
        idMap[a.ekId] = g.id;
        const animalId = g.id;

        const bulk: Record<"treatments" | "care" | "weights" | "tasks" | "animalNotes", any[]> = { treatments: [], care: [], weights: [], tasks: [], animalNotes: [] };
        /* health history + reminders */
        const existT = new Set((await all("SELECT batch_id FROM treatments WHERE animal_id = ? AND batch_id LIKE 'EK-%'", animalId)).map((r: any) => r.batch_id));
        const existC = new Set((await all("SELECT batch_id FROM care_records WHERE animal_id = ? AND batch_id LIKE 'EK-%'", animalId)).map((r: any) => r.batch_id));
        const existW = new Set((await all("SELECT date, lbs FROM weights WHERE animal_id = ?", animalId)).map((r: any) => `${r.date}|${Number(r.lbs)}`));
        const existTasks = new Set((await all("SELECT source FROM tasks WHERE source LIKE 'EK-REM-%'")).map((r: any) => r.source));
        for (const t of a.health ?? []) {
          const isRem = t.headers.some((h) => /task due|due/i.test(h)) || /scheduled/i.test(t.heading);
          const cD = col(t, isRem ? /due/i : /date/i), cC = col(t, /category/i), cA = col(t, /activity/i), cN = col(t, /note/i);
          for (const r of t.rows) {
            const category = S(cell(r, cC).join(" ")), act = cell(r, cA), name = S(act[0]), second = S(act.slice(1).join(" "));
            const noteText = fullText(r, cN);
            if (isRem) {
              const rid = idIn(r.links, /treatment_reminders\/(\d+)/); const source = `EK-REM-${rid ?? `${a.ekId}-${norm(name)}`}`;
              if (existTasks.has(source)) continue;
              const ev = second.match(/every\s+(\d+)\s*(hour|day|week|month|year)s?/i);
              let every: number | null = null, unit = "days";
              if (ev) { const n = Number(ev[1]), u = ev[2].toLowerCase(); if (u === "hour") { every = n; unit = "hours"; } else every = u === "week" ? n * 7 : u === "month" ? n * 30 : u === "year" ? n * 365 : n; }
              const doseTxt = S(second.replace(/every\s+\d+\s*\w+/i, "")) || null;
              const isDose = TREAT_CATS.test(category);
              const med = isDose ? medBy(name) : undefined;
              const d = parseDose(doseTxt ?? "");
              const reeval = /re-?evaluate/i.test(noteText);
              if (g.status !== "active") continue; // reminders for a goat that's gone are left behind
              bulk.tasks.push({
                title: isDose ? `${name} — reminder` : name || category || "EasyKeeper reminder",
                dueDate: dueFrom(cell(r, cD).join(" ")), animalId, animalIds: String(animalId), kind: isDose ? "dose" : "task",
                medicationId: med?.id ?? null, medName: isDose ? name : null, doseText: d.ml ? null : doseTxt, doseMl: d.ml ?? null,
                notes: S(noteText.replace(/re-?evaluate/i, "")) || null, repeatEvery: every, repeatUnit: unit, reeval, source,
                batchId: isDose ? source : null,
              });
              existTasks.add(source); report.reminders++;
              continue;
            }
            const date = isoDate(cell(r, cD).join(" "));
            if (!date) continue;
            const eid = idIn(r.links, /health_events\/(\d+)/);
            const key = `EK-HE-${eid ?? `${a.ekId}-${date}-${norm(name)}`}`;
            const det = eid ? a.healthDetails?.[eid] : undefined;
            const doseRaw = S(det?.dosage) || second;
            if (/weight/i.test(category) || /^weight$/i.test(name)) {
              const lbs = parseWeightLbs(second || doseRaw);
              if (lbs && !existW.has(`${date}|${lbs}`)) { bulk.weights.push({ animalId, date, lbs, method: "scale" }); existW.add(`${date}|${lbs}`); report.weights++; }
              continue;
            }
            if (TREAT_CATS.test(category)) {
              if (existT.has(key)) continue;
              const med = medBy(name);
              const d = parseDose(doseRaw);
              const reason = [d.plain ? `Dose ${d.plain} (unit not given)` : d.text && !d.mg ? d.text : null, d.rest || null, S(det?.notes) || noteText || null].filter(Boolean).join("; ") || null;
              const milkClear = med?.milkWithdrawalDays ? addDays(date, med.milkWithdrawalDays) : null;
              const meatClear = med?.meatWithdrawalDays ? addDays(date, med.meatWithdrawalDays) : null;
              bulk.treatments.push({
                animalId, medicationId: med?.id ?? null, medName: name || category, date,
                doseMl: d.ml ?? null, doseMg: d.mg ?? null, doseDetail: d.mg ? d.text : null,
                route: S(det?.route) || null, reason,
                milkClearDate: milkClear && milkClear >= todayISO() ? milkClear : null,
                meatClearDate: meatClear && meatClear >= todayISO() ? meatClear : null,
                batchId: key, notes: `EasyKeeper ${category}: ${[name, doseRaw].filter(Boolean).join(" ")}${noteText ? ` | ${noteText}` : ""}`,
              });
              existT.add(key); report.treatments++;
              continue;
            }
            if (existC.has(key)) continue;
            const kind = careKind(category, name);
            const scored = /body condition|famacha|test|temperature|udder|fecal|blood/i.test(kind + " " + category);
            bulk.care.push({
              animalId, date, kind,
              score: scored && second ? second.slice(0, 60) : null,
              notes: [kind === "Maintenance" || kind === name ? name : name !== kind ? name : null, !scored ? second : null, noteText].filter(Boolean).join(" — ") || null,
              batchId: key,
            });
            existC.add(key); report.care++;
          }
        }

        /* breeding and kidding */
        if (g.sex === "doe") {
          const existB = await all("SELECT id, date, buck, kidding_date, status FROM breedings WHERE doe_id = ?", animalId);
          const existH = new Set((await all("SELECT date FROM heats WHERE doe_id = ?", animalId)).map((r: any) => r.date));
          const rows: { date: string; method: string; outcome: string; buck: string; details: string; id: string | null }[] = [];
          for (const t of a.breedings ?? []) {
            const cD = col(t, /date/i), cM = col(t, /method/i), cO = col(t, /outcome/i), cB = col(t, /buck|bred to|sire/i), cDet = col(t, /detail/i);
            for (const r of t.rows) {
              const date = isoDate(cell(r, cD).join(" ")); if (!date) continue;
              rows.push({ date, method: S(cell(r, cM).join(" ")), outcome: S(cell(r, cO).join(" ")), buck: S(cell(r, cB).join(" ")), details: fullText(r, cDet), id: idIn(r.links, /breedings\/(\d+)/) });
            }
          }
          rows.sort((x, y) => x.date.localeCompare(y.date));
          const used = new Set<number>();
          const methodOf = (m: string) => /\bai\b|artificial|insemin/i.test(m) ? "AI" : /hand/i.test(m) ? "Hand" : "Pen";
          for (let i = 0; i < rows.length; i++) {
            if (used.has(i)) continue;
            const r = rows[i];
            if (/estrus|heat/i.test(r.outcome)) {
              if (!existH.has(r.date)) { await storage.create("heats", { doeId: animalId, date: r.date, notes: r.details || null }); existH.add(r.date); report.heats++; }
              continue;
            }
            let rec: any;
            if (/kidding|kidded|freshen/i.test(r.outcome)) {
              const k = r.details.match(/(\d+)\s*does?.*?(\d+)\s*bucks?/i), gest = r.details.match(/(\d+)\s*day/i);
              const kids = k ? Number(k[1]) + Number(k[2]) : (r.details.match(/(\d+)\s*kids?/i) ? Number(RegExp.$1) : null);
              const bred = gest ? addDays(r.date, -Number(gest[1])) : addDays(r.date, -150);
              rec = { doeId: animalId, buck: r.buck || "Unknown", date: bred, method: methodOf(r.method), dueDate: addDays(bred, 150), status: "kidded", kiddingDate: r.date, kidsBorn: kids, notes: [r.details, gest ? null : "Breeding date estimated from the kidding date"].filter(Boolean).join(" · ") || null };
            } else {
              // A service/exposure joined to the kidding that followed it (same buck, 135–165 days later)
              const j = rows.findIndex((y, n) => n > i && !used.has(n) && /kidding|kidded/i.test(y.outcome) && (!y.buck || !r.buck || norm(y.buck) === norm(r.buck)) && daysBetween(r.date, y.date) >= 135 && daysBetween(r.date, y.date) <= 165);
              const open = /unsuccess|false|open|not pregnant|abort|absorb/i.test(r.outcome);
              rec = { doeId: animalId, buck: r.buck || "Unknown", date: r.date, method: methodOf(r.method), dueDate: addDays(r.date, 150), status: open ? "open" : /pregnan|confirm|settled/i.test(r.outcome) ? "confirmed" : "bred", notes: [r.outcome && !/servic|expos|bred/i.test(r.outcome) ? r.outcome : null, r.details].filter(Boolean).join(" · ") || null };
              if (j >= 0) {
                const y = rows[j]; used.add(j);
                const k = y.details.match(/(\d+)\s*does?.*?(\d+)\s*bucks?/i);
                rec.status = "kidded"; rec.kiddingDate = y.date; rec.kidsBorn = k ? Number(k[1]) + Number(k[2]) : null;
                rec.notes = [rec.notes, y.details].filter(Boolean).join(" · ") || null;
              }
            }
            const dup = existB.find((b: any) => (b.kidding_date && rec.kiddingDate && b.kidding_date === rec.kiddingDate) || (b.date === rec.date && norm(b.buck) === norm(rec.buck)));
            if (dup) continue;
            rec.buckSource = null; // typed-in buck until the finish step links it to a herd, guest or tank buck
            await storage.create("breedings", rec);
            existB.push({ date: rec.date, buck: rec.buck, kidding_date: rec.kiddingDate ?? null });
            report.breedings++;
          }
        }

        /* notes, status history, harvest */
        const existN = new Set((await all("SELECT date, note FROM animal_notes WHERE animal_id = ?", animalId)).map((r: any) => `${r.date}|${norm(r.note)}`));
        const addNote = async (date: string | null, note: string, by: string | null = null) => {
          const n = S(note); if (!n) return;
          const d = date || todayISO(); const k = `${d}|${norm(n)}`;
          if (existN.has(k)) return;
          bulk.animalNotes.push({ animalId, date: d, note: n.slice(0, 2000), enteredBy: by });
          existN.add(k); report.notes++;
        };
        for (const t of a.notes ?? []) {
          const cD = col(t, /date/i), cT = col(t, /title/i), cN = col(t, /^note/i), cI = col(t, /initial|by/i);
          for (const r of t.rows) {
            const title = fullText(r, cT), body = fullText(r, cN), by = S(cell(r, cI).join(" "));
            await addNote(isoDate(cell(r, cD).join(" ")), [title && norm(title) !== norm(body) ? `${title}:` : null, body].filter(Boolean).join(" "), by && !/auto/i.test(by) ? by : null);
          }
        }
        for (const t of a.status ?? []) {
          const cD = col(t, /date/i), cS = col(t, /status/i), cDet = col(t, /detail/i), cN = col(t, /note/i);
          for (const r of t.rows) {
            const s = S(cell(r, cS).join(" ")); if (!s) continue;
            await addNote(isoDate(cell(r, cD).join(" ")), `Status: ${[s, fullText(r, cDet), fullText(r, cN)].filter(Boolean).join(" — ")}`);
          }
        }
        for (const t of a.harvest ?? []) for (const r of t.rows) await addNote(isoDate(r.cells.map((c) => c.join(" ")).join(" ")), `Harvest: ${t.headers.map((h, i) => h && S(cell(r, i).join(" ")) ? `${h}: ${S(cell(r, i).join(" "))}` : "").filter(Boolean).join(" · ")}`);

        /* milk: lactations (fresh → dry) */
        for (const t of a.lactations ?? []) {
          const cS = col(t, /fresh|start|kidd|begin/i), cE = col(t, /dry|end/i);
          const existL = new Set((await all("SELECT start_date FROM lactations WHERE animal_id = ?", animalId)).map((r: any) => r.start_date));
          for (const r of t.rows) {
            const start = isoDate(cell(r, cS >= 0 ? cS : 0).join(" ")); if (!start || existL.has(start)) continue;
            const end = cE >= 0 ? isoDate(cell(r, cE).join(" ")) : null;
            const summary = t.headers.map((h, i) => h && i !== cS && i !== cE && S(cell(r, i).join(" ")) ? `${h}: ${S(cell(r, i).join(" "))}` : "").filter(Boolean).join(" · ");
            await storage.create("lactations", { animalId, startDate: start, endDate: end, notes: summary ? `EasyKeeper: ${summary}` : null });
            existL.add(start); report.lactations++;
          }
        }
        for (const [r, rows] of Object.entries(bulk)) await insertMany(r as ResourceName, rows);
      });
    } catch (e: any) {
      report.skipped.push(`${a.list?.name || a.ekId}: ${e?.message ?? e}`);
    }
  }
  return { idMap, report };
}

/** After every chunk: parents tidied to registered names, and breedings pointed at the herd buck */
export async function finish() {
  const tidied = await storage.tidyParents();
  const herd: any[] = await storage.list("animals");
  const bucks = herd.filter((a) => a.sex === "buck");
  const outside: any[] = await storage.list("outsideBucks");
  let linked = 0;
  await tx(async () => {
    const rows = await all("SELECT id, buck FROM breedings WHERE buck_ref_id IS NULL");
    for (const b of rows as any[]) {
      const n = norm(b.buck); if (!n) continue;
      const hb = bucks.find((x) => norm(x.name) === n || norm(x.barnName) === n || (x.regNumber && norm(x.regNumber) === n));
      if (hb) { await run("UPDATE breedings SET buck_ref_id = ?, buck_source = 'herd', buck = ? WHERE id = ?", hb.id, hb.name, b.id); linked++; continue; }
      const ob = outside.find((x) => norm(x.name) === n);
      if (ob) { await run("UPDATE breedings SET buck_ref_id = ?, buck_source = ? WHERE id = ?", ob.id, ob.kind === "frozen" ? "frozen" : "guest", b.id); linked++; }
    }
  });
  const missingAdga = herd.filter((a) => !a.pedigreeUrl && adgaUrl(a.regNumber));
  for (const a of missingAdga) await run("UPDATE animals SET pedigree_url = ? WHERE id = ?", adgaUrl(a.regNumber), a.id);
  return { tidied, linkedBucks: linked, adgaLinks: missingAdga.length };
}

/* ---------- routes ---------- */
const PHOTO_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(s3[.-][a-z0-9.-]*amazonaws\.com|amazonaws\.com|easykeeper\.com|cloudfront\.net)\//i;
export function registerEasyKeeperRoutes(app: Express, ownerOnly: (req: Request, res: Response, next: NextFunction) => void) {
  app.post("/api/import/easykeeper/chunk", ownerOnly, async (req, res) => {
    const animals: EKAnimal[] = Array.isArray(req.body?.animals) ? req.body.animals : [];
    const allEkIds = new Set<string>((req.body?.allEkIds ?? []).map(String));
    if (!animals.length) return res.status(400).json({ message: "No goats in this part of the file." });
    if ((await activeHerd()) === "demo") return res.status(409).json({ message: "The demo herd is showing. Switch to your own herd (Import & export → My herd) before importing." });
    res.json(await importChunk(animals, allEkIds, { overwrite: !!req.body?.overwrite }));
  });
  app.post("/api/import/easykeeper/finish", ownerOnly, async (_req, res) => res.json(await finish()));
  /** Photos that already came over (so a second run doesn't copy them again) */
  app.get("/api/import/easykeeper/photos-done", ownerOnly, async (_req, res) => res.json((await settings.get("ekPhotosDone")) ?? []));
  app.post("/api/import/easykeeper/photos-done", ownerOnly, async (req, res) => {
    const have: string[] = (await settings.get("ekPhotosDone")) ?? [];
    const add: string[] = (req.body?.ids ?? []).map(String);
    await settings.set("ekPhotosDone", Array.from(new Set([...have, ...add])));
    res.json({ ok: true });
  });
  /** EasyKeeper keeps photos on Amazon S3, which a web page isn't allowed to read directly; hand the picture back from here */
  app.get("/api/import/easykeeper/photo", ownerOnly, async (req, res) => {
    const url = String(req.query.url ?? "");
    if (!PHOTO_HOSTS.test(url)) return res.status(400).json({ message: "That isn't an EasyKeeper photo link." });
    try {
      const r = await fetch(url);
      if (!r.ok) return res.status(502).json({ message: `EasyKeeper photo couldn't be opened (${r.status}).` });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 4_200_000) return res.status(413).json({ message: "too large" });
      res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
      res.setHeader("Cache-Control", "no-store");
      res.end(buf);
    } catch (e: any) { res.status(502).json({ message: e?.message ?? "Photo couldn't be opened." }); }
  });
}
