/* Duplicate finder for goat imports: matches each spreadsheet row to a goat already in the app,
   says how sure it is and why, and works out which blanks the file can fill in and where the two disagree. */
import { storage } from "./storage";

export const IMPORT_FIELDS = ["name", "barnName", "tag", "regNumber", "herdbook", "earType", "sex", "breed", "dob", "color", "eyeColor", "hornStatus", "tattooLocation", "tattooRight", "tattooLeft", "chipLocation", "microchip", "status", "groupName", "sire", "dam", "pedigreeUrl", "notes"] as const;

const low = (x: any) => String(x ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const digits = (x: any) => String(x ?? "").replace(/\D/g, "");
const reg = (x: any) => low(x).replace(/[\s.-]/g, "");
/** Name without a herd prefix (e.g. "Goat Joy") and punctuation, for looser matching */
const core = (x: any, prefixes: string[]) => { let n = low(x).replace(/[^a-z0-9 ]/g, ""); for (const p of prefixes) if (n.startsWith(p + " ")) { n = n.slice(p.length + 1); break; } return n.trim(); };
const blank = (v: any) => v === null || v === undefined || String(v).trim() === "";
import { findParent } from "@shared/breed";
let herdNow: any[] = [], outsideNow: any[] = [];
const pName = (t: any) => { const s = String(t ?? "").trim(); if (!s) return null; const g = findParent(s, herdNow) ?? findParent(s, outsideNow); return g ? g.name : s; };
const same = (f: string, a: any, b: any) => (f === "sire" || f === "dam") ? sameParent(a, b) : sameBasic(f, a, b);
const sameParent = (a: any, b: any) => low(a) === low(b) || low(pName(a)) === low(pName(b)); // barn name vs registered name of the same goat
const sameBasic = (f: string, a: any, b: any) => (f === "microchip" ? digits(a) === digits(b) : f === "regNumber" ? reg(a) === reg(b) : low(a) === low(b));

export type Check = {
  matchId: number | null; matchName?: string; matchTag?: string | null;
  confidence: "none" | "sure" | "possible"; reasons: string[]; warnings: string[];
  fills: string[]; diffs: { field: string; app: any; file: any }[];
};

export async function checkRows(rows: any[]): Promise<Check[]> {
  const animals = await storage.list("animals");
  const pastures = await storage.list("pastures");
  herdNow = animals; outsideNow = await storage.list("outsideBucks");
  const pName = (id?: number | null) => pastures.find((p) => p.id === id)?.name ?? "";
  // Common herd prefixes = first two words shared by 3+ goats (e.g. "goat joy")
  const counts = new Map<string, number>();
  for (const a of animals) { const w = low(a.name).split(" "); if (w.length > 2) { const k = w.slice(0, 2).join(" "); counts.set(k, (counts.get(k) ?? 0) + 1); } }
  const prefixes = Array.from(counts).filter(([, n]) => n >= 3).map(([k]) => k.replace(/[^a-z0-9 ]/g, "")).concat(["goat joy"]);

  return rows.map((r) => {
    const score = new Map<number, { pts: number; reasons: string[] }>();
    const hit = (a: any, pts: number, why: string) => { const s = score.get(a.id) ?? { pts: 0, reasons: [] }; s.pts += pts; s.reasons.push(why); score.set(a.id, s); };
    for (const a of animals) {
      if (r.regNumber && a.regNumber && reg(r.regNumber) === reg(a.regNumber)) hit(a, 10, "same registration #");
      if (r.microchip && a.microchip && digits(r.microchip).length >= 9 && digits(r.microchip) === digits(a.microchip)) hit(a, 10, "same microchip");
      if (r.tattooRight && r.tattooLeft && low(r.tattooRight) === low(a.tattooRight) && low(r.tattooLeft) === low(a.tattooLeft)) hit(a, 8, "same tattoos");
      if (r.name && low(r.name) === low(a.name)) hit(a, 8, "same name");
      else if (r.name && core(r.name, prefixes) && core(r.name, prefixes) === core(a.name, prefixes)) hit(a, 4, "similar name");
      if (r.tag && a.tag && low(r.tag) === low(a.tag)) hit(a, 3, "same tag #");
      if (r.barnName && a.barnName && low(r.barnName) === low(a.barnName)) hit(a, 2, "same barn name");
      if (r.dob && a.dob && r.dob === a.dob) hit(a, 1, "same birth date");
    }
    const ranked = Array.from(score).sort((x, y) => y[1].pts - x[1].pts);
    if (!ranked.length || ranked[0][1].pts < 3) return { matchId: null, confidence: "none", reasons: [], warnings: [], fills: [], diffs: [] };
    const [id, best] = ranked[0];
    const a = animals.find((x) => x.id === id)!;
    const warnings: string[] = [];
    let sure = best.pts >= 8;
    // Things that suggest it may be a different goat after all
    if (r.dob && a.dob && r.dob !== a.dob) { warnings.push("birth dates differ"); sure = false; }
    if (r.sex && a.sex && r.sex !== a.sex && !(r.sex === "wether" && a.sex === "buck")) { warnings.push("sex differs"); sure = false; }
    if (r.regNumber && a.regNumber && reg(r.regNumber) !== reg(a.regNumber)) { warnings.push("different registration #"); sure = false; }
    const runner = ranked[1];
    if (runner && runner[1].pts >= 3) { warnings.push(`also looks like ${animals.find((x) => x.id === runner[0])?.name}`); sure = false; }
    const fills: string[] = []; const diffs: Check["diffs"] = [];
    for (const f of IMPORT_FIELDS) {
      if (blank(r[f])) continue;
      if (blank(a[f])) fills.push(f);
      else if (f === "notes") { if (!low(a.notes).includes(low(r.notes))) fills.push(f); }
      else if (!same(f, a[f], r[f])) diffs.push({ field: f, app: a[f], file: r[f] });
    }
    if (r.pasture) { if (!a.pastureId) fills.push("pasture"); else if (low(pName(a.pastureId)) !== low(r.pasture)) diffs.push({ field: "pasture", app: pName(a.pastureId), file: r.pasture }); }
    if (r.inMilk !== undefined && !!r.inMilk !== !!a.inMilk) diffs.push({ field: "inMilk", app: a.inMilk ? "Yes" : "No", file: r.inMilk ? "Yes" : "No" });
    return { matchId: id, matchName: a.name, matchTag: a.tag, confidence: sure ? "sure" : "possible", reasons: best.reasons, warnings, fills, diffs };
  });
}
