import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { findParent } from "@shared/breed";
import type { Animal, Weight, Medication, Treatment, Breeding, Milk, Task, Pasture, PastureMove, OutsideBuck, Heat, Show, AnimalNote, Lactation, Care, BreedingPlan, Contact } from "@shared/schema";

export type { Animal, Weight, Medication, Treatment, Breeding, Milk, Task, Pasture, PastureMove, OutsideBuck, Heat, Show, AnimalNote, Lactation, Care, BreedingPlan, Contact };

export const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

type ResMap = {
  animals: Animal; weights: Weight; medications: Medication; treatments: Treatment;
  breedings: Breeding; milk: Milk; tasks: Task; pastures: Pasture; pastureMoves: PastureMove; outsideBucks: OutsideBuck; heats: Heat; shows: Show; animalNotes: AnimalNote; lactations: Lactation; care: Care; breedingPlans: BreedingPlan; contacts: Contact;
};
export type Res = keyof ResMap;

export function useList<R extends Res>(r: R) {
  return useQuery<ResMap[R][]>({ queryKey: [`/api/${r}`] });
}

export function invalidateAll() {
  queryClient.invalidateQueries();
}

export function useSave<R extends Res>(r: R) {
  return useMutation({
    mutationFn: async (data: Partial<ResMap[R]> & { id?: number }) => {
      const res = data.id
        ? await apiRequest("PATCH", `/api/${r}/${data.id}`, data)
        : await apiRequest("POST", `/api/${r}`, data);
      return res.json();
    },
    onSuccess: invalidateAll,
  });
}

export function useRemove(r: Res) {
  return useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/${r}/${id}`)).json(),
    onSuccess: invalidateAll,
  });
}

export async function post(url: string, body?: unknown) {
  const res = await apiRequest("POST", url, body);
  invalidateAll();
  return res.json();
}

/* ---------- dates ---------- */
export const today = () => toISO(new Date());
export function toISO(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function addDays(iso: string, n: number) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000);
}
// Date formatting is slow in browsers, so each date is formatted once and remembered
const longFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const fmtCache = new Map<string, string>();
// A bad or partial date (e.g. half-typed in a date box) shows as a dash instead of crashing the screen
const cached = (key: string, f: () => string) => {
  let v = fmtCache.get(key);
  if (v === undefined) { try { v = f(); } catch { console.warn("Unreadable date", key); return "—"; } fmtCache.set(key, v); }
  return v;
};
export function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return cached("L" + iso, () => longFmt.format(new Date(iso + "T12:00:00")));
}
export function fmtShort(iso?: string | null) {
  if (!iso) return "—";
  return cached("S" + iso, () => shortFmt.format(new Date(iso + "T12:00:00")));
}
export function relDays(iso: string) {
  const n = daysBetween(today(), iso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
export function age(dob?: string | null) {
  if (!dob) return "—";
  const months = Math.floor(daysBetween(dob, today()) / 30.44);
  if (months < 12) return `${months} mo`;
  const y = Math.floor(months / 12), m = months % 12;
  return m ? `${y} yr ${m} mo` : `${y} yr`;
}

/* ---------- weights & dosing ---------- */
/** The goat's most recent weight: newest date, and the last one entered when two share a date */
export function latestWeight(animalId: number, weights: Weight[] = []) {
  return weights.filter((w) => w.animalId === animalId).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];
}
/** Doses worked out from body weight (these need a checked weight before they're given) */
export const WEIGHT_DOSE_UNITS = ["mg/lb", "mg/kg", "mL/100lb", "mL/25lb", "mL/lb"];
export const isWeightDosed = (m?: { doseUnit?: string | null } | null) => !!m && WEIGHT_DOSE_UNITS.includes(m.doseUnit ?? "");
/** "85 lb · weighed Sep 12 (18 days ago)" */
export const weighedText = (w?: Weight) => (w ? `${w.lbs} lb · weighed ${fmtShort(w.date)} (${relDays(w.date)})` : "No weight on file");
/** A typed weight that isn't the one on file: save it so every later dose uses it */
export const weightChanged = (lbs: any, lw?: Weight) => Number(lbs) > 0 && (!lw || Math.abs(Number(lbs) - lw.lbs) > 0.001);
/** Save new weights entered while dosing (only the ones that differ from what's on file) */
export async function saveDoseWeights(list: { animalId: number; lbs: any; date: string }[], weights: Weight[]) {
  const rows = list.filter((r) => weightChanged(r.lbs, latestWeight(r.animalId, weights)))
    .map((r) => ({ animalId: r.animalId, date: r.date, lbs: Math.round(Number(r.lbs) * 10) / 10, method: "at treatment" }));
  if (rows.length) await post("/api/weights/bulk", rows);
  return rows.length;
}

export const DOSE_UNITS = [
  { value: "mg/lb", label: "mg per lb (needs mg/mL strength)" },
  { value: "mg/kg", label: "mg per kg (needs mg/mL strength)" },
  { value: "mL/100lb", label: "mL per 100 lb" },
  { value: "mL/25lb", label: "mL per 25 lb" },
  { value: "mL/lb", label: "mL per lb" },
  { value: "mL/head", label: "mL per head (fixed)" },
  { value: "drops", label: "Drops (fixed, eye meds)" },
  { value: "capsules", label: "Capsules (fixed, oral)" },
  { value: "tablets", label: "Tablets (fixed, oral)" },
  { value: "tubes", label: "Tubes per side (intramammary)" },
];
/** Eye and udder treatments are given to one side or both */
export const SIDES = [{ value: "Left", label: "Left" }, { value: "Right", label: "Right" }, { value: "Both", label: "Both" }];
export const hasSide = (route?: string | null) => route === "Eye" || route === "Intramammary";
/** Intramammary: a whole or half tube in each treated side */
export const TUBE_AMOUNTS = [{ value: "1", label: "1 tube per side" }, { value: "0.5", label: "½ tube per side" }];
const tubes = (n: number) => `${n === 0.5 ? "½" : n} tube${n > 1 ? "s" : ""} per side`;
/** Oral meds given as capsules or tablets: "capsule" | "tablet", or null */
export const pillUnitOf = (m?: { doseUnit?: string | null } | null) => m?.doseUnit === "capsules" ? "capsule" : m?.doseUnit === "tablets" ? "tablet" : m?.doseUnit === "tubes" ? "tube" : null;
/** How an oral dose can be measured when it's logged */
export const ORAL_UNITS = [{ value: "mL", label: "mL" }, { value: "capsule", label: "Capsule" }, { value: "tablet", label: "Tablet" }];
const pills = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}`;
/** Eye meds dosed in drops: the dose is a drop count, not mL */
export const isDrops = (m?: { doseUnit?: string | null } | null) => m?.doseUnit === "drops";
/** How often a repeating reminder comes back */
export const everyText = (n?: number | null) => (!n ? "" : n === 1 ? "Every day" : n === 7 ? "Every week" : `Every ${n} days`);
/** What a reminder says to give: "1 drop · Eye", "10 mL · SQ", or the dosage as written */
export const taskDoseText = (k: { drops?: number | null; doseMl?: number | null; doseText?: string | null; route?: string | null }) =>
  [doseText(k) || k.doseText || "", k.route || ""].filter(Boolean).join(" · ");
/** A logged dose as text: "2 drops" or "1.5 mL" */
export const doseText = (t: { doseMl?: number | null; drops?: number | null; pillCount?: number | null; pillUnit?: string | null; side?: string | null }) => {
  const d = t.pillCount && t.pillUnit === "tube" ? tubes(t.pillCount) : t.pillCount && t.pillUnit ? pills(t.pillCount, t.pillUnit) : t.drops ? `${t.drops} drop${t.drops === 1 ? "" : "s"}` : t.doseMl ? `${t.doseMl} mL` : "";
  return [d, t.side ? (t.side === "Both" ? "both sides" : t.side) : ""].filter(Boolean).join(" · ");
};

export function calcDoseMl(med: Medication | undefined, lbs: number | undefined | null): number | null {
  if (!med) return null;
  const w = Number(lbs) || 0;
  const conc = Number(med.concentration) || 0;
  let ml: number | null = null;
  switch (med.doseUnit) {
    case "mg/lb": ml = conc ? (w * med.doseAmount) / conc : null; break;
    case "mg/kg": ml = conc ? ((w / 2.2046) * med.doseAmount) / conc : null; break;
    case "mL/100lb": ml = (w * med.doseAmount) / 100; break;
    case "mL/25lb": ml = (w * med.doseAmount) / 25; break;
    case "mL/lb": ml = w * med.doseAmount; break;
    case "mL/head": ml = med.doseAmount; break;
    case "drops": case "capsules": case "tablets": case "tubes": return med.doseAmount || null; // a count, the same for every goat
  }
  if (ml === null || !isFinite(ml)) return null;
  if (med.doseUnit !== "mL/head" && !w) return null;
  return Math.round(ml * 10) / 10;
}

export function doseRuleText(m: Medication) {
  const u = m.doseUnit;
  if (u === "mL/head") return `${m.doseAmount} mL per head`;
  if (u === "tubes") return tubes(m.doseAmount || 1);
  if (u === "capsules" || u === "tablets") return `${pills(m.doseAmount, u.slice(0, -1))} per dose`;
  if (u === "drops") return `${m.doseAmount} drop${m.doseAmount === 1 ? "" : "s"} per dose`;
  if (u === "mL/100lb" && Math.abs(m.doseAmount - 9.09) < 0.01) return "1 mL per 11 lb"; // Calf-Pro label
  if (u.startsWith("mg")) return `${m.doseAmount} ${u}${m.concentration ? ` · ${m.concentration} mg/mL` : ""}`;
  return `${m.doseAmount} ${u.replace("/", " per ").replace("lb", " lb").replace("  ", " ")}`;
}

/* ---------- withdrawal ---------- */
/** Milk holds only count for active does in milk (a dry doe's hold shows again if she freshens before it clears). Meat holds count for everyone. */
export function activeHolds(treatments: Treatment[] = [], animals: Animal[] = []) {
  const t = today();
  const milking = new Set(animals.filter((a) => a.sex === "doe" && a.status === "active" && a.inMilk).map((a) => a.id));
  const milk = new Map<number, Treatment>();
  const meat = new Map<number, Treatment>();
  for (const tr of treatments) {
    if (tr.milkClearDate && tr.milkClearDate > t && milking.has(tr.animalId)) {
      const cur = milk.get(tr.animalId);
      if (!cur || (cur.milkClearDate ?? "") < tr.milkClearDate) milk.set(tr.animalId, tr);
    }
    if (tr.meatClearDate && tr.meatClearDate > t) {
      const cur = meat.get(tr.animalId);
      if (!cur || (cur.meatClearDate ?? "") < tr.meatClearDate) meat.set(tr.animalId, tr);
    }
  }
  return { milk, meat };
}

/* ---------- search ---------- */
/** Breed key that ignores case, spaces and hyphens ("La Mancha" = "Lamancha") */
export const breedKey = (s?: string | null) => (s ?? "").toLowerCase().replace(/[\s-]+/g, "");
/** Single color words, so "White" also finds "Brown and white" */
export const colorWords = (s?: string | null) => (s ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !["and", "with"].includes(w));
export const breedOptions = (animals: { breed?: string | null }[]) => {
  const m = new Map<string, string>();
  for (const a of animals) if (a.breed?.trim() && !m.has(breedKey(a.breed))) m.set(breedKey(a.breed), a.breed.trim());
  return Array.from(m.entries()).sort((x, y) => x[1].localeCompare(y[1]));
};
export const colorOptions = (animals: { breed?: string | null; color?: string | null }[], breed = "all") =>
  Array.from(new Set(animals.filter((a) => breed === "all" || breedKey(a.breed) === breed).flatMap((a) => colorWords(a.color)))).sort();

export function matchesAnimal(a: Animal, q: string, extra = "") {
  if (!q.trim()) return true;
  const hay = [a.name, a.barnName, a.breed?.replace(/[\s-]+/g, ""), a.tag, a.regNumber, a.herdbook, a.earType, a.groupName, extra, a.sire, a.dam, a.color, a.breed, a.sex, a.status, a.notes, a.tattooLeft, a.tattooRight, a.microchip, a.eyeColor, a.hornStatus, a.milkStatus ? MILK_STATUS[a.milkStatus as MilkStatus] : ""]
    .filter(Boolean).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((term) => hay.includes(term));
}

/** Identification lookup: tattoo (left/right), microchip digits, herd tag, reg #. Returns best match or null. */
export type IdHit = { field: "tattooLeft" | "tattooRight" | "microchip" | "tag" | "regNumber"; label: string; value: string; score: number };
export function idMatch(a: Animal, q: string): IdHit | null {
  const t = q.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return null;
  const hits: IdHit[] = [];
  const L = (a.tattooLeft ?? "").toUpperCase(), R = (a.tattooRight ?? "").toUpperCase();
  const where = a.tattooLocation === "tail" ? "tail" : "ear";
  if (L && L === t) hits.push({ field: "tattooLeft", label: `Left ${where} tattoo`, value: L, score: 100 });
  else if (L && L.startsWith(t)) hits.push({ field: "tattooLeft", label: `Left ${where} tattoo`, value: L, score: 80 });
  else if (L && t.length >= 2 && L.includes(t)) hits.push({ field: "tattooLeft", label: `Left ${where} tattoo`, value: L, score: 50 });
  const digits = t.replace(/\D/g, "");
  if (a.microchip && digits.length >= 3 && digits === t) {
    if (a.microchip === digits) hits.push({ field: "microchip", label: "Microchip", value: a.microchip, score: 100 });
    else if (a.microchip.endsWith(digits)) hits.push({ field: "microchip", label: "Microchip", value: a.microchip, score: 90 });
    else if (a.microchip.includes(digits)) hits.push({ field: "microchip", label: "Microchip", value: a.microchip, score: 60 });
  }
  if (a.tag && a.tag.toUpperCase() === t) hits.push({ field: "tag", label: "Herd tag", value: a.tag, score: 85 });
  if (R && R === t) hits.push({ field: "tattooRight", label: `Right ${where} tattoo`, value: R, score: 40 });
  if (a.regNumber && t.length >= 3 && a.regNumber.toUpperCase().includes(t)) hits.push({ field: "regNumber", label: "Reg #", value: a.regNumber, score: 70 });
  return hits.sort((x, y) => y.score - x.score)[0] ?? null;
}
export const fmtChip = (c?: string | null) => (c ? c.replace(/(\d{3})(?=\d)/g, "$1 ") : "");
export const HORN_LABEL: Record<string, string> = { disbudded: "Disbudded", polled: "Polled", horned: "Horned", scurs: "Scurs" };

export function shortName(name: string) {
  return name.replace(/^Goat Joy\s+/i, "");
}
/** The name used everywhere: barn name first, registered name if there isn't one */
export function goatName(a: { name: string; barnName?: string | null } | null | undefined) {
  if (!a) return "";
  return (a.barnName && a.barnName.trim()) || shortName(a.name ?? "");
}
/** Registered name, shown smaller, only when it differs from the barn name */
export function regName(a: { name: string; barnName?: string | null } | null | undefined) {
  if (!a || !a.barnName || !a.barnName.trim()) return "";
  const n = shortName(a.name ?? "");
  const b = a.barnName.trim().toLowerCase(), r = n.trim().toLowerCase();
  // Nothing new to show when the barn name already starts with the registered name (e.g. "Aioli T49 9354")
  return !r || b === r || b.startsWith(r + " ") ? "" : n;
}

export const GESTATION_DAYS = 150;
/** Ultrasound is requested this many days after breeding */
export const ULTRASOUND_DAYS = 30;
/** CD&T and BoSe are given this many days before the due date */
export const PREKID_DAYS = 30;
export const RECHECK_DAYS = 14;
export const usDue = (b: Breeding) => (b.usResult === "recheck" && b.usDate ? addDays(b.usDate, RECHECK_DAYS) : addDays(b.date, ULTRASOUND_DAYS));
export const needsUltrasound = (b: Breeding) => b.status === "bred" && b.usResult !== "positive" && b.usResult !== "negative";
export const prekidDue = (b: Breeding) => (b.status === "confirmed" && b.dueDate ? addDays(b.dueDate, -PREKID_DAYS) : null);
/* ---------- CD&T vaccine schedule ---------- */
export const isCdt = (name?: string | null) => /\bcd\s*&?\s*t\b|\bcdt\b/i.test(name ?? "");
/** Kid jobs (weekly weights, kid CD&T) land on a Monday: a due date 1–3 days after a Monday moves back to
    that Monday; 4–6 days after moves on to the next Monday. */
export function kidMonday(d: string) {
  const off = (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7; // Monday = 0
  return off === 0 ? d : off <= 3 ? addDays(d, -off) : addDays(d, 7 - off);
}
export const KID_CDT_AGE_DAYS = 28; // first kid dose at 4 weeks
export const KID_CDT_GAP_DAYS = 28; // second dose 4 weeks later
export type VaxItem = { animal: Animal; due: string; kind: "kid1" | "kid2" | "annual"; last?: string; doses: number };
/** Works out every active goat's next CD&T from her treatment records:
 *  kids at 4 weeks and 4 weeks later, then a yearly booster. Bred does that are confirmed get theirs 30 days before kidding instead. */
export function cdtSchedule(animals: Animal[], treatments: Treatment[], breedings: Breeding[], tasks: Task[], t: string) {
  const byAnimal = new Map<number, string[]>();
  for (const tr of treatments) if (isCdt(tr.medName)) { const l = byAnimal.get(tr.animalId) ?? []; l.push(tr.date); byAnimal.set(tr.animalId, l); }
  const pendingTask = new Set<number>();
  for (const k of tasks) if (!k.done && k.kind === "dose" && isCdt(k.title)) for (const id of String(k.animalIds || k.animalId || "").split(",").map(Number)) if (id) pendingTask.add(id);
  const prekid = new Map<number, string>();
  for (const b of breedings) if (b.status === "confirmed" && !b.prekidDate && b.dueDate) prekid.set(b.doeId, addDays(b.dueDate, -PREKID_DAYS));
  const kid: VaxItem[] = [], annual: VaxItem[] = [], noRecord: Animal[] = [];
  for (const a of animals) {
    if (a.status !== "active" || pendingTask.has(a.id)) continue;
    const doses = (byAnimal.get(a.id) ?? []).sort();
    const ageDays = a.dob ? daysBetween(a.dob, t) : null;
    if (!doses.length) {
      // Only kids entered as newborns count from birth; everyone else waits for a CD&T date to be entered
      if (a.cdtFromBirth && a.dob && ageDays !== null && ageDays < 365) kid.push({ animal: a, due: kidMonday(addDays(a.dob, KID_CDT_AGE_DAYS)), kind: "kid1", doses: 0 });
      else noRecord.push(a);
      continue;
    }
    if (doses.length === 1 && a.dob && daysBetween(a.dob, doses[0]) < 365) { kid.push({ animal: a, due: kidMonday(addDays(doses[0], KID_CDT_GAP_DAYS)), kind: "kid2", last: doses[0], doses: 1 }); continue; }
    const last = doses[doses.length - 1];
    const pk = prekid.get(a.id);
    if (pk && pk <= addDays(last, 365)) continue; // pre-kidding CD&T comes first, so that is her booster
    annual.push({ animal: a, due: addDays(last, 365), kind: "annual", last, doses: doses.length });
  }
  annual.sort((x, y) => x.due.localeCompare(y.due));
  return { kid, annual, noRecord };
}

export const US_LABEL: Record<string, string> = { positive: "Positive (pregnant)", negative: "Negative (open)", recheck: "Recheck" };

/** Compare goat names loosely: case, spacing and the "Goat Joy" herd prefix don't matter. */
export function normName(n?: string | null) {
  return (n ?? "").toLowerCase().replace(/^goat joy\s+/, "").replace(/\s+/g, " ").trim();
}
/** Kids of a goat: any goat whose sire or dam (name, barn name, reg # or tattoo) points to it */
const kidsCache = new WeakMap<Animal[], Map<number, Animal[]>>();
export function progenyOf(parent: Animal, all: Animal[]) {
  let m = kidsCache.get(all);
  if (!m) {
    m = new Map();
    for (const x of all) for (const txt of [x.sire, x.dam]) {
      const p = findParent(txt, all);
      if (p && p.id !== x.id) { const l = m.get(p.id) ?? []; if (!l.includes(x)) l.push(x); m.set(p.id, l); }
    }
    kidsCache.set(all, m);
  }
  return m.get(parent.id) ?? [];
}
export function findByName(name: string | null | undefined, all: Animal[]) {
  return findParent(name, all) ?? undefined;
}

/** Current local time as HH:MM */
export const nowTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
/** "14:30" → "2:30 PM" */
export function fmtTime(t?: string | null) {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
export function addHours(date: string, time: string, h: number) {
  const d = new Date(`${date}T${(time || "08:00").padStart(5, "0")}:00`);
  d.setHours(d.getHours() + h);
  return { date: toISO(d), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
}
export type RepeatUnit = "days" | "hours";
/** How often a medication repeats, in plain words */
export function repeatText(every?: number | null, unit?: string | null) {
  if (!every) return "";
  if (unit === "hours") {
    const perDay = 24 / every;
    const named: Record<number, string> = { 1: "hourly", 2: "every 2 hours", 12: "twice a day", 8: "3 times a day", 6: "4 times a day", 24: "once a day" };
    return named[every] ?? (Number.isInteger(perDay) ? `every ${every} hours (${perDay}× a day)` : `every ${every} hours`);
  }
  return every === 1 ? "once a day" : `every ${every} days`;
}
/** Barn hours: timed repeat doses that would fall outside this window move to the next morning's start */
export type BarnHours = { start: string; end: string };
export const DEFAULT_BARN_HOURS: BarnHours = { start: "06:00", end: "22:00" };
/** Dose times for a schedule: first dose + N repeats every E days or hours (optionally kept inside barn hours) */
export function doseSchedule(start: string, times: number, every: number, unit: RepeatUnit = "days", startTime = "08:00", barn?: BarnHours | null) {
  const out: { date: string; time: string | null }[] = [{ date: start, time: unit === "hours" ? startTime : null }];
  if (!(times > 0 && every > 0)) return out;
  if (unit !== "hours") { for (let k = 1; k <= times; k++) out.push({ date: addDays(start, every * k), time: null }); return out; }
  let cur = { date: start, time: startTime };
  for (let k = 1; k <= Math.min(times, 1000); k++) {
    cur = addHours(cur.date, cur.time, every);
    if (barn && barn.start < barn.end) {
      // A little past closing (up to a quarter of the gap, e.g. 3 h on a twice-daily schedule): give it at closing instead.
      // Further past: next morning's start.
      const mins = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
      if (cur.time > barn.end) cur = mins(cur.time) - mins(barn.end) <= (every * 60) / 4 ? { date: cur.date, time: barn.end } : { date: addDays(cur.date, 1), time: barn.start };
      else if (cur.time < barn.start) cur = { date: cur.date, time: barn.start };
    }
    out.push(cur);
  }
  return out;
}
/** How many doses fit in N days starting at the first dose (used for "for X days") */
export function dosesInDays(start: string, startTime: string, days: number, every: number, unit: RepeatUnit, barn?: BarnHours | null) {
  if (unit !== "hours") return Math.floor((days - 1) / every) + 1;
  const endAt = addHours(start, startTime, days * 24), key = (x: { date: string; time: string | null }) => `${x.date} ${x.time}`;
  const all = doseSchedule(start, Math.ceil((days * 24) / every) + 1, every, unit, startTime, barn);
  return all.filter((x) => key(x) < key(endAt)).length;
}
/** Is a scheduled dose late? Timed doses are late once their time has passed today */
export const doseLate = (k: { dueDate: string; dueTime?: string | null }, t = today()) => k.dueDate < t || (k.dueDate === t && !!k.dueTime && k.dueTime < nowTime());
/** For each repeat series keep only the next dose, with how many more are left today and in total */
export function nextDoses<T extends { id: number; batchId?: string | null; dueDate: string; dueTime?: string | null; done?: boolean | null }>(tasks: T[], t = today()) {
  const by = new Map<string, T[]>();
  for (const k of tasks) { if (k.done) continue; const key = k.batchId || `t${k.id}`; by.set(key, [...(by.get(key) ?? []), k]); }
  return Array.from(by.values()).map((l) => {
    l.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? "").localeCompare(b.dueTime ?? ""));
    return { task: l[0], moreToday: l.slice(1).filter((x) => x.dueDate === t).length, remaining: l.length - 1, last: l[l.length - 1] };
  });
}

/** How many days a pasture has been empty (null if occupied or never used) */
export function restingDays(pastureId: number, animals: Animal[], moves: PastureMove[]) {
  if (animals.some((a) => a.status === "active" && a.pastureId === pastureId)) return null;
  const last = moves.filter((m) => m.fromPastureId === pastureId).sort((a, b) => b.date.localeCompare(a.date))[0];
  return last ? daysBetween(last.date, today()) : null;
}

/* ---------- heat (estrus) tracking ---------- */
export const HEAT_TYPICAL = 21;       // days; goats cycle roughly every 18–22 days
export const HEAT_RANGE = [17, 25];   // intervals outside this are treated as missed/odd cycles
export const HEAT_WINDOW = 2;         // watch ± days around the predicted date
export const HEAT_SIGNS = ["Flagging", "Bleating", "Mucus", "Swollen vulva", "Standing", "Mounting", "Buck interest", "Off feed", "Milk drop"];

export type HeatState = "now" | "soon" | "upcoming" | "return" | "check";
export type HeatWatchItem = {
  doe: Animal; last: string; lastFrom: "heat" | "breeding"; interval: number; personal: boolean; cycles: number;
  next: string; windowStart: string; windowEnd: string; daysUntil: number; missed: number; state: HeatState; breeding?: Breeding;
};

/** Heat dates for one doe: logged heats plus breeding dates (a doe is bred in heat), de-duplicated within 3 days */
export function heatDates(doeId: number, heats: Heat[], breedings: Breeding[]) {
  const raw = [
    ...heats.filter((h) => h.doeId === doeId).map((h) => ({ date: h.date, from: "heat" as const })),
    ...breedings.filter((b) => b.doeId === doeId).map((b) => ({ date: b.date, from: "breeding" as const })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const out: typeof raw = [];
  for (const r of raw) {
    const prev = out[out.length - 1];
    if (prev && daysBetween(prev.date, r.date) <= 3) { if (r.from === "heat") out[out.length - 1] = { ...r, date: prev.date }; continue; }
    out.push(r);
  }
  return out;
}

/** The doe's own cycle length from her history (a skipped heat — a double-length gap — counts as two cycles) */
export function heatInterval(dates: string[]) {
  const vals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const g = daysBetween(dates[i - 1], dates[i]);
    if (g >= HEAT_RANGE[0] && g <= HEAT_RANGE[1]) vals.push(g);
    else if (g >= HEAT_RANGE[0] * 2 && g <= HEAT_RANGE[1] * 2) vals.push(g / 2);
  }
  const recent = vals.slice(-4); // lean on her latest cycles
  return recent.length ? { interval: Math.round(recent.reduce((s, v) => s + v, 0) / recent.length), cycles: recent.length, personal: true }
    : { interval: HEAT_TYPICAL, cycles: 0, personal: false };
}

export function heatWatch(animals: Animal[], heats: Heat[], breedings: Breeding[], t = today()) {
  const items: HeatWatchItem[] = [];
  const noHistory: Animal[] = [];
  for (const doe of animals) {
    if (doe.sex !== "doe" || doe.status !== "active") continue;
    if (doe.dob && daysBetween(doe.dob, t) < 180) continue; // doelings under ~6 months
    const obs = heatDates(doe.id, heats, breedings);
    const latestB = breedings.filter((b) => b.doeId === doe.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    const last = obs[obs.length - 1];
    if (latestB?.status === "confirmed") continue; // pregnant
    if (!last) { noHistory.push(doe); continue; }
    if (latestB?.status === "kidded" && (latestB.kiddingDate ?? latestB.date) >= last.date) continue; // kidded, no heat logged since
    const { interval, cycles, personal } = heatInterval(obs.map((o) => o.date));
    const bredThisCycle = latestB && latestB.status === "bred" && latestB.date >= addDays(last.date, -3);
    let next = addDays(last.date, interval);
    let missed = 0;
    let state: HeatState;
    if (bredThisCycle) {
      // Bred (breeding day counts as her heat day). Keep watching every return-heat window until an ultrasound
      // confirms her; "missed" counts the windows that passed with no return heat logged.
      while (addDays(next, HEAT_WINDOW) < t && missed < 12) { next = addDays(next, interval); missed++; }
      state = "return";
    } else {
      while (addDays(next, HEAT_WINDOW) < t && missed < 12) { next = addDays(next, interval); missed++; }
      const du = daysBetween(t, next);
      state = Math.abs(du) <= HEAT_WINDOW ? "now" : du <= 5 ? "soon" : "upcoming";
    }
    items.push({
      doe, last: last.date, lastFrom: last.from, interval, personal, cycles, next,
      windowStart: addDays(next, -HEAT_WINDOW), windowEnd: addDays(next, HEAT_WINDOW), daysUntil: daysBetween(t, next),
      missed, state, breeding: bredThisCycle ? latestB : undefined,
    });
  }
  items.sort((a, b) => a.next.localeCompare(b.next));
  return { items, noHistory };
}

/* ---------- Milk tests ---------- */
export const MAX_TESTS_PER_MONTH = 2;
export const MILK_OUTS = [1, 2, 3] as const;
/** Distinct test dates, newest first */
export function milkTestDates(milk: Milk[]) {
  return Array.from(new Set(milk.map((m) => m.date))).sort((a, b) => b.localeCompare(a));
}
export function testsInMonth(milk: Milk[], month: string) {
  return milkTestDates(milk).filter((d) => d.slice(0, 7) === month);
}
export const monthName = (iso: string) => new Date(iso.slice(0, 7) + "-15T12:00:00").toLocaleDateString(undefined, { month: "long" });

/* ---------- milk status and days in milk ---------- */
export type MilkStatus = "milking" | "mastitis" | "drying" | "dry";
export const MILK_STATUS: Record<MilkStatus, string> = { milking: "In milk", mastitis: "Mastitis", drying: "Drying up", dry: "Dry" };
export const isMilking = (s?: string | null) => s === "milking" || s === "mastitis" || s === "drying";
/** Days in milk: this lactation (counting kidding day as day 1) and the running total across every lactation on file */
export function daysInMilk(animalId: number, lactations: Lactation[], t = today()) {
  const mine = lactations.filter((l) => l.animalId === animalId).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const len = (l: Lactation) => Math.max(0, daysBetween(l.startDate, l.endDate && l.endDate < t ? l.endDate : t) + 1);
  const open = [...mine].reverse().find((l) => !l.endDate);
  return { current: open ? len(open) : null, total: mine.reduce((s, l) => s + len(l), 0), count: mine.length, open, list: mine.map((l, i) => ({ ...l, no: i + 1, days: len(l) })) };
}

/* ---------- everyday care jobs (Batch entry → Care) ---------- */
export type CareType = { name: string; score?: "famacha" | "bcs" | "result"; every?: number; hint?: string };
export const CARE_TYPES: CareType[] = [
  { name: "Hoof trim", every: 56, hint: "Every 6–8 weeks" },
  { name: "FAMACHA", score: "famacha", every: 14, hint: "Score 1–5 · 4 and 5 need attention" },
  { name: "Body condition", score: "bcs", every: 30, hint: "Score 1–5" },
  { name: "Clipping / shaving" },
  { name: "Udder check", score: "result" },
  { name: "Bath / wash" },
  { name: "Blood draw (CAE, CL, Johne's)", score: "result", every: 365 },
  { name: "Fecal sample", score: "result" },
  { name: "Disbudding" },
  { name: "Tattoo" },
  { name: "Ear tag / microchip placed" },
  { name: "Banding / castration" },
  { name: "Weaning" },
  { name: "Collar change" },
];
export const careType = (name?: string | null) => CARE_TYPES.find((c) => c.name.toLowerCase() === (name ?? "").toLowerCase());
export const FAMACHA_LABEL: Record<string, string> = { "1": "1 · Red (optimal)", "2": "2 · Red-pink", "3": "3 · Pink (borderline)", "4": "4 · Pink-white (anemic)", "5": "5 · White (severely anemic)" };
export const famachaFlag = (score?: string | null) => Number(score) >= 4;
/** Most recent record of this job for a goat */
export function lastCare(animalId: number, kind: string, care: Care[]) {
  let best: Care | undefined;
  for (const c of care) if (c.animalId === animalId && c.kind === kind && (!best || c.date > best.date)) best = c;
  return best;
}

/* ---------- body temperature ---------- */
/** Normal adult goat rectal temperature is about 101.5–103.5 °F */
export function tempNote(f?: number | string | null): { tone: "low" | "high" | "ok"; text: string } | null {
  const n = Number(f);
  if (!f || !isFinite(n) || n <= 0) return null;
  if (n < 101.5) return { tone: "low", text: "below normal (101.5–103.5 °F)" };
  if (n > 103.5) return { tone: "high", text: n >= 105 ? "high fever" : "fever" };
  return { tone: "ok", text: "normal" };
}
export const fmtTemp = (f?: number | null) => (f ? `${f} °F` : "");

/* ---------- kid Calf-Pro program ---------- */
/** Every kid born on or after this date is enrolled automatically; older kids can be added from their profile */
export const CALF_PRO = "Calf-Pro";
export const CALF_PRO_START = "2026-09-28";
export const CALF_PRO_AGE = 4; // first daily dose at 4 days old
export const isCalfPro = (name?: string | null) => (name ?? "").trim().toLowerCase().replace(/[\s-]/g, "") === "calfpro";
export type CalfProKid = {
  animal: Animal; age: number; start: string; started: boolean; givenToday: boolean;
  lastGiven?: string; daysGiven: number; lastWeight?: Weight; weighDue: boolean; weighDate: string;
};
export const weaned = (animalId: number, care: Care[]) => care.some((c) => c.animalId === animalId && c.kind === "Weaning");
export function calfProEnrolled(a: Animal, care: Care[]) {
  if (a.status !== "active" || !a.dob || weaned(a.id, care)) return false;
  return a.calfPro === 1 || (a.calfPro !== 0 && a.dob >= CALF_PRO_START);
}
/** Kids on the program: Calf-Pro once a day from 4 days old until weaned, weighed every week */
export function calfProKids(animals: Animal[], care: Care[], treatments: Treatment[], weights: Weight[], t = today()): CalfProKid[] {
  const out: CalfProKid[] = [];
  for (const a of animals) {
    if (!calfProEnrolled(a, care)) continue;
    const given = treatments.filter((x) => x.animalId === a.id && isCalfPro(x.medName)).map((x) => x.date).sort();
    const lw = latestWeight(a.id, weights);
    const start = addDays(a.dob!, CALF_PRO_AGE);
    const weighDate = lw ? kidMonday(addDays(lw.date, 7)) : t; // weekly weigh-in on Mondays
    out.push({ animal: a, age: daysBetween(a.dob!, t), start, started: start <= t, givenToday: given.includes(t),
      lastGiven: given[given.length - 1], daysGiven: new Set(given).size, lastWeight: lw, weighDue: weighDate <= t, weighDate });
  }
  return out.sort((x, y) => x.animal.dob!.localeCompare(y.animal.dob!) || x.animal.name.localeCompare(y.animal.name));
}
