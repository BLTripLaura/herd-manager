import * as s from "@shared/schema";
import { and, eq, sql, getTableName } from "drizzle-orm";
import { db, tx, all, get, run } from "./db";
import { findParent, kidBreed, kidHerdbook, defaultTattooLocation } from "@shared/breed";

export const MAX_TESTS_PER_MONTH = 2;


const CALF_PRO_NOTE = "Suggested dose: 0.1 mL per lb body weight, by mouth in the milk. Kid program: once a day from 4 days old until weaned. No withdrawal.";
// Simple app settings (layout preferences etc.); kept when records are erased
export const settings = {
  async get(key: string): Promise<any> {
    const row = await get<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", key);
    try { return row ? JSON.parse(row.value) : null; } catch { return null; }
  },
  async set(key: string, value: any) {
    await run("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, JSON.stringify(value));
    return value;
  },
};

export const resources = {
  animals: { table: s.animals, schema: s.insertAnimalSchema },
  weights: { table: s.weights, schema: s.insertWeightSchema },
  medications: { table: s.medications, schema: s.insertMedicationSchema },
  treatments: { table: s.treatments, schema: s.insertTreatmentSchema },
  breedings: { table: s.breedings, schema: s.insertBreedingSchema },
  milk: { table: s.milk, schema: s.insertMilkSchema },
  tasks: { table: s.tasks, schema: s.insertTaskSchema },
  pastures: { table: s.pastures, schema: s.insertPastureSchema },
  pastureMoves: { table: s.pastureMoves, schema: s.insertPastureMoveSchema },
  outsideBucks: { table: s.outsideBucks, schema: s.insertOutsideBuckSchema },
  heats: { table: s.heats, schema: s.insertHeatSchema },
  shows: { table: s.shows, schema: s.insertShowSchema },
  animalNotes: { table: s.animalNotes, schema: s.insertAnimalNoteSchema },
  lactations: { table: s.lactations, schema: s.insertLactationSchema },
  care: { table: s.care, schema: s.insertCareSchema },
  breedingPlans: { table: s.breedingPlans, schema: s.insertBreedingPlanSchema },
  contacts: { table: s.contacts, schema: s.insertContactSchema },
} as const;
export const IN_MILK = ["milking", "mastitis", "drying"];
export type ResourceName = keyof typeof resources;

export class DatabaseStorage {
  async list(r: ResourceName): Promise<any[]> {
    const t: any = resources[r].table;
    const rows: any[] = await db.select().from(t).orderBy(t.id);
    // Medicine cabinet (and every medicine picker) in A–Z order
    if (r === "medications") rows.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "en", { sensitivity: "base", numeric: true }));
    return rows;
  }
  async create(r: ResourceName, data: any): Promise<any> {
    if (r === "animals") data = await this.animalDefaults(data);
    const [row] = await db.insert(resources[r].table as any).values(data).returning();
    return row;
  }
  /** Uniform parent records: a sire/dam typed as a barn name, tattoo or reg # is stored as that goat's registered name */
  async parentName(text: any, selfId?: number, herdIn?: any[], outsideIn?: any[]) {
    const t = String(text ?? "").trim();
    if (!t) return null;
    const herd = (herdIn ?? await this.list("animals")).filter((a: any) => a.id !== selfId);
    const g = findParent(t, herd) ?? findParent(t, outsideIn ?? await this.list("outsideBucks"));
    return g ? g.name : t;
  }
  /** Kid program: make sure Calf-Pro is in the medication list */
  async ensureCalfPro() {
    const rows = await all("SELECT name FROM medications");
    if (rows.some((r) => String(r.name).toLowerCase().replace(/[\s-]/g, "") === "calfpro")) return;
    await run("INSERT INTO medications (name, category, dose_amount, dose_unit, route, repeat_days, repeat_unit, repeat_times, milk_withdrawal_days, meat_withdrawal_days, on_hand_ml, reorder_at_ml, vet_confirmed, notes) VALUES (?, 'Supplement', 0.1, 'mL/lb', 'Oral', 1, 'days', 0, 0, 0, 0, 0, false, ?)",
      "Calf-Pro", CALF_PRO_NOTE);
  }
  /** Tidy every goat's sire and dam to registered names. Returns how many records changed. */
  async tidyParents() {
    const all_ = await this.list("animals");
    const outside = await this.list("outsideBucks");
    let n = 0;
    await tx(async () => {
      for (const a of all_) {
        const others = all_.filter((x: any) => x.id !== a.id);
        const fix = (t: any) => { const s = String(t ?? "").trim(); if (!s) return null; const g = findParent(s, others) ?? findParent(s, outside); return g ? g.name : s; };
        // A parent that points back to the goat itself (its own tattoo or reg # in the Dam column) is an import mix-up: clear it and keep a note
        const isSelf = (t: any) => !!String(t ?? "").trim() && findParent(t, [a]) === a && !findParent(t, others);
        const notes: string[] = [];
        let sire = fix(a.sire), dam = fix(a.dam);
        if (isSelf(a.sire)) { notes.push(`Sire was listed as "${a.sire}", which is this goat's own ID, so it was cleared.`); sire = null; }
        if (isSelf(a.dam)) { notes.push(`Dam was listed as "${a.dam}", which is this goat's own ID, so it was cleared.`); dam = null; }
        if (notes.length) await run("UPDATE animals SET notes = ? WHERE id = ?", [a.notes, ...notes].filter(Boolean).join("\n"), a.id);
        if (sire !== (a.sire ?? null) || dam !== (a.dam ?? null)) { await run("UPDATE animals SET sire = ?, dam = ? WHERE id = ?", sire, dam, a.id); n++; }
      }
    });
    return n;
  }
  /** New goats: breed and herdbook worked out from the parents when not given, and Lamanchas tattooed in the tail web */
  async animalDefaults(data: any) {
    const d = { ...data };
    const herd = await this.list("animals");
    const outside = await this.list("outsideBucks");
    if ("sire" in d) d.sire = await this.parentName(d.sire, undefined, herd, outside);
    if ("dam" in d) d.dam = await this.parentName(d.dam, undefined, herd, outside);
    if ((!d.breed || !d.herdbook) && (d.sire || d.dam)) {
      const dam = findParent(d.dam, herd);
      const sire = findParent(d.sire, herd) ?? findParent(d.sire, outside);
      if (dam && sire) {
        if (!d.breed) d.breed = kidBreed(dam.breed, sire.breed) ?? undefined;
        if (!d.herdbook) d.herdbook = kidHerdbook(dam, sire) ?? undefined;
      }
    }
    if (!d.tattooLocation) d.tattooLocation = defaultTattooLocation(d.breed);
    // A kid entered within 90 days of birth gets its CD&T reminders counted from the birth date
    if (d.cdtFromBirth === undefined || d.cdtFromBirth === null) {
      const age = d.dob ? (Date.now() - Date.parse(d.dob + "T12:00:00Z")) / 86400000 : NaN;
      d.cdtFromBirth = age >= -1 && age <= 90;
    }
    return d;
  }
  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return tx(fn);
  }
  async createMany(r: ResourceName, rows: any[]) {
    return tx(async () => { const out: any[] = []; for (const row of rows) out.push(await this.create(r, row)); return out; });
  }
  async update(r: ResourceName, id: number, data: any) {
    const t: any = resources[r].table;
    const { id: _ignore, ...rest } = data ?? {};
    if (r === "tasks" && rest.done === true) {
      const before: any = await get("SELECT done FROM tasks WHERE id = ?", id);
      if (before && !before.done) { const row = await db.update(t).set(rest).where(eq(t.id, id)).returning(); await this.rollRepeat(id, todayIso()); return (row as any)[0]; }
    }
    if (r === "animals") {
      if ("sire" in rest) rest.sire = await this.parentName(rest.sire, id);
      if ("dam" in rest) rest.dam = await this.parentName(rest.dam, id);
      // Renamed goat: kids that listed the old registered name follow the new one
      if (rest.name) {
        const old: any = await get("SELECT name FROM animals WHERE id = ?", id);
        if (old && old.name !== rest.name) {
          await run("UPDATE animals SET sire = ? WHERE sire = ? AND id != ?", rest.name, old.name, id);
          await run("UPDATE animals SET dam = ? WHERE dam = ? AND id != ?", rest.name, old.name, id);
        }
      }
    }
    if (!Object.keys(rest).length) { const [row] = await db.select().from(t).where(eq(t.id, id)); return row; }
    const [row] = await db.update(t).set(rest).where(eq(t.id, id)).returning();
    if (r === "animals" && (row as any)?.status && (row as any).status !== "active") await this.dropUpcoming(id);
    return row;
  }
  /** A goat marked sold or deceased: take her off every repeat dose and reminder that hasn't been done yet.
      Shared doses keep going for the other goats; a reminder with nobody left is removed. History is kept. */
  async dropUpcoming(animalId: number) {
    const open: any[] = await all("SELECT id, animal_id, animal_ids FROM tasks WHERE done = false");
    let removed = 0;
    for (const k of open) {
      const ids = String(k.animal_ids || k.animal_id || "").split(",").map(Number).filter(Boolean);
      if (!ids.includes(animalId)) continue;
      const left = ids.filter((x) => x !== animalId);
      if (!left.length) await run("DELETE FROM tasks WHERE id = ?", k.id);
      else await run("UPDATE tasks SET animal_ids = ?, animal_id = ? WHERE id = ?", left.join(","), left.length === 1 ? left[0] : null, k.id);
      removed++;
    }
    await run("UPDATE treatments SET next_dose_date = NULL WHERE animal_id = ? AND next_dose_date >= ?", animalId, new Date().toISOString().slice(0, 10));
    return removed;
  }
  async remove(r: ResourceName, id: number) {
    const t: any = resources[r].table;
    await tx(async () => {
      if (r === "breedings") { const [b] = await db.select().from(s.breedings).where(eq(s.breedings.id, id)); await this.restoreStraws(b); }
      await db.delete(t).where(eq(t.id, id));
      if (r === "animals") {
        await this.dropUpcoming(id);
        await run("DELETE FROM animal_photos WHERE animal_id = ?", id);
        await run("DELETE FROM animal_papers WHERE animal_id = ?", id);
        for (const [k, v] of [["care", s.care.animalId], ["lactations", s.lactations.animalId], ["weights", s.weights.animalId], ["shows", s.shows.animalId], ["animalNotes", s.animalNotes.animalId], ["pastureMoves", s.pastureMoves.animalId], ["treatments", s.treatments.animalId], ["milk", s.milk.animalId], ["breedings", s.breedings.doeId], ["heats", s.heats.doeId], ["breedingPlans", s.breedingPlans.doeId]] as const) {
          await db.delete((resources as any)[k].table).where(eq(v as any, id));
        }
      }
      if (r === "pastures") await db.update(s.animals).set({ pastureId: null }).where(eq(s.animals.pastureId, id));
    });
  }
  /** Move animals to a pasture (or null = unassigned) and log each move. */
  async moveAnimals(ids: number[], pastureId: number | null, date: string) {
    return tx(async () => {
      const moves: any[] = [];
      for (const id of ids) {
        const [a]: any[] = await db.select().from(s.animals).where(eq(s.animals.id, id));
        if (!a || (a.pastureId ?? null) === pastureId) continue;
        await db.update(s.animals).set({ pastureId }).where(eq(s.animals.id, id));
        const [m] = await db.insert(s.pastureMoves).values({ animalId: id, fromPastureId: a.pastureId ?? null, toPastureId: pastureId, date }).returning();
        moves.push(m);
      }
      return moves;
    });
  }
  async undoMoves(moveIds: number[]) {
    await tx(async () => {
      for (const mid of moveIds) {
        const [m]: any[] = await db.select().from(s.pastureMoves).where(eq(s.pastureMoves.id, mid));
        if (!m) continue;
        await db.update(s.animals).set({ pastureId: m.fromPastureId }).where(eq(s.animals.id, m.animalId));
        await db.delete(s.pastureMoves).where(eq(s.pastureMoves.id, mid));
      }
    });
  }
  /** Save treatments and schedule repeat-dose tasks. */
  async logTreatments(rows: any[], repeat?: { times: number; everyDays?: number; every?: number; unit?: string; at?: { date: string; time: string | null }[] }) {
    return tx(async () => {
      const times = Math.max(0, Math.floor(Number(repeat?.times) || 0));
      const hours = repeat?.unit === "hours";
      const every = Math.max(1, Math.floor(Number(repeat?.every ?? repeat?.everyDays) || 0));
      // The app sends the exact dose times for hourly schedules (already kept inside barn hours)
      const given = Array.isArray(repeat?.at) ? repeat!.at!.filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date)) : null;
      const at = (date: string, time: string | null | undefined, k: number) => given && given[k - 1] ? { date: given[k - 1].date, time: given[k - 1].time ?? null }
        : hours ? addHoursIso(date, time || "08:00", every * k) : { date: addDaysIso(date, every * k), time: null as string | null };
      const batchId = rows[0]?.batchId || `S-${Date.now()}`;
      const total = times ? times + 1 : null;
      const created: any[] = [];
      for (const r of rows) {
        const row = { ...r, batchId: r.batchId || batchId };
        if (times) { row.doseNo = row.doseNo ?? 1; row.doseTotal = row.doseTotal ?? total; row.nextDoseDate = at(row.date, row.time, 1).date; }
        const t = await this.create("treatments", row);
        if (t.medicationId && t.doseMl) await this.adjustStock(t.medicationId, -t.doseMl);
        created.push(t);
      }
      if (times && created.length) {
        const first = created[0];
        const startNo = first.doseNo ?? 1;
        const ids = created.map((t: any) => t.animalId).join(",");
        for (let k = 1; k <= times; k++) {
          await this.create("tasks", {
            title: `${first.medName} — dose ${startNo + k} of ${first.doseTotal}`,
            dueDate: at(first.date, first.time, k).date, dueTime: at(first.date, first.time, k).time, animalId: created.length === 1 ? first.animalId : null,
            done: false, kind: "dose", medicationId: first.medicationId, batchId: first.batchId, animalIds: ids,
            doseNo: startNo + k, doseTotal: first.doseTotal,
          });
        }
      }
      return created;
    });
  }
  /** Log a scheduled repeat dose: copies each animal's first dose, recomputes withdrawal, marks task done. */
  /** Repeating reminder done or skipped: add the next one, counted from when it was done (like EasyKeeper) */
  async rollRepeat(taskId: number, from: string) {
    const k: any = await get("SELECT * FROM tasks WHERE id = ?", taskId);
    if (!k?.repeat_every) return null;
    const ids = String(k.animal_ids || k.animal_id || "").split(",").map(Number).filter(Boolean);
    if (ids.length) {
      const live: any[] = await all(`SELECT id FROM animals WHERE status = 'active' AND id IN (${ids.join(",")})`);
      if (!live.length) return null;
    }
    const [row] = await db.insert(s.tasks).values({
      title: k.title, dueDate: addDaysIso(from, k.repeat_every), dueTime: k.due_time, animalId: k.animal_id, kind: k.kind, medicationId: k.medication_id,
      batchId: k.batch_id, animalIds: k.animal_ids, medName: k.med_name, doseText: k.dose_text, doseMl: k.dose_ml, drops: k.drops,
      route: k.route, notes: k.notes, repeatEvery: k.repeat_every, source: k.source, done: false,
    } as any).returning();
    return row;
  }
  async giveDose(taskId: number, date: string, givenBy?: string | null, skipIds: number[] = [], temps: Record<string, number | null> = {}, time: string | null = null) {
    return tx(async () => {
      const [task]: any[] = await db.select().from(s.tasks).where(eq(s.tasks.id, taskId));
      if (!task) throw new Error("Task not found");
      const [med]: any[] = task.medicationId ? await db.select().from(s.medications).where(eq(s.medications.id, task.medicationId)) : [null];
      const prior = ((task.batchId ? await db.select().from(s.treatments).where(eq(s.treatments.batchId, task.batchId)) : []) as any[])
        .sort((a, b) => a.date.localeCompare(b.date));
      const ids = String(task.animalIds || task.animalId || "").split(",").map(Number).filter((x) => x && !skipIds.includes(x));
      const created: any[] = [];
      for (const aid of ids) {
        let base: any = prior.find((p) => p.animalId === aid) ?? prior[0];
        if (!base && task.medName) {
          // Open-ended reminder with no earlier dose in the app: use what the reminder says to give
          const why = [task.doseText ? `Dose: ${task.doseText}` : null, task.notes].filter(Boolean).join("; ");
          base = { medicationId: task.medicationId, medName: task.medName, weightLbs: null, doseMl: task.doseMl ?? null, drops: task.drops ?? null,
            route: task.route ?? med?.route ?? null, reason: why || null, givenBy: null, batchId: task.batchId };
        }
        if (!base) continue;
        const t = await this.create("treatments", {
          animalId: aid, medicationId: base.medicationId, medName: base.medName, date, time: time || null, weightLbs: base.weightLbs, tempF: Number(temps[aid]) || null, doseMl: base.doseMl, drops: base.drops ?? null, pillCount: base.pillCount ?? null, pillUnit: base.pillUnit ?? null, side: base.side ?? null,
          route: base.route, reason: base.reason, givenBy: givenBy || base.givenBy, batchId: base.batchId,
          doseNo: task.doseNo, doseTotal: task.doseTotal, notes: null,
          milkClearDate: addDaysIso(date, med?.milkWithdrawalDays ?? 0), meatClearDate: addDaysIso(date, med?.meatWithdrawalDays ?? 0),
          nextDoseDate: null,
        });
        if (t.medicationId && t.doseMl) await this.adjustStock(t.medicationId, -t.doseMl);
        created.push(t);
      }
      await db.update(s.tasks).set({ done: true }).where(eq(s.tasks.id, taskId));
      await this.rollRepeat(taskId, date);
      return created;
    });
  }
  /** Skip one repeat dose: it comes off the list without logging a treatment; the next dose stays on schedule. */
  async skipDose(taskId: number) {
    const t: any = await get("SELECT id FROM tasks WHERE id = ? AND kind = 'dose' AND done = false", taskId);
    if (!t) throw new Error("That dose isn't on the list any more.");
    await run("UPDATE tasks SET done = true, skipped = true WHERE id = ?", taskId);
    const k: any = await get("SELECT due_date FROM tasks WHERE id = ?", taskId);
    await this.rollRepeat(taskId, k.due_date);
    return { ok: true };
  }
  /** Stop a repeat-dose series from this dose on, for all its goats or just some. Doses already given stay. */
  async stopDoses(taskId: number, stopIds?: number[] | null) {
    return tx(async () => {
      const t: any = await get("SELECT * FROM tasks WHERE id = ? AND kind = 'dose'", taskId);
      if (!t) throw new Error("That dose isn't on the list any more.");
      const rest: any[] = t.batch_id ? await all("SELECT * FROM tasks WHERE batch_id = ? AND kind = 'dose' AND done = false", t.batch_id) : [t];
      const ids = (k: any) => String(k.animal_ids || k.animal_id || "").split(",").map(Number).filter(Boolean);
      const stop = new Set(stopIds?.length ? stopIds.map(Number) : ids(t));
      let removed = 0;
      for (const k of rest) {
        const left = ids(k).filter((x) => !stop.has(x));
        if (!left.length) { await run("DELETE FROM tasks WHERE id = ?", k.id); removed++; }
        else await run("UPDATE tasks SET animal_ids = ?, animal_id = ? WHERE id = ?", left.join(","), left.length === 1 ? left[0] : null, k.id);
      }
      if (t.batch_id) for (const a of Array.from(stop)) await run("UPDATE treatments SET next_dose_date = NULL WHERE batch_id = ? AND animal_id = ?", t.batch_id, a);
      return { removed, goats: stop.size };
    });
  }
  /** Pre-kidding shots: log CD&T and BoSe from the Medicine Cabinet for a confirmed doe, and mark them given on the breeding. */
  async givePrekid(breedingId: number, date: string, givenBy?: string | null) {
    return tx(async () => {
      const [b]: any[] = await db.select().from(s.breedings).where(eq(s.breedings.id, breedingId));
      if (!b) throw new Error("Breeding not found");
      const meds: any[] = await db.select().from(s.medications);
      const find = (re: RegExp) => meds.find((m) => re.test(m.name));
      const w: any = await get("SELECT lbs AS w FROM weights WHERE animal_id = ? ORDER BY date DESC, id DESC LIMIT 1", b.doeId);
      const lbs = w?.w ?? null;
      const rows = [["CD&T vaccine", find(/\bcd\s*&?\s*t\b|\bcdt\b/i)], ["BoSe (selenium + vitamin E)", find(/\bbo-?se\b/i)]].map(([label, m]: any) => {
        let dose: number | null = null;
        if (m?.doseAmount) {
          const per = /ml\s*\/\s*(\d+)\s*lb/i.exec(m.doseUnit ?? "");
          if (/head/i.test(m.doseUnit ?? "")) dose = m.doseAmount;
          else if (per && lbs) dose = Math.round((m.doseAmount * lbs / Number(per[1])) * 10) / 10;
        }
        return { animalId: b.doeId, medicationId: m?.id ?? null, medName: m?.name ?? label, date, weightLbs: lbs, doseMl: dose, route: m?.route ?? null,
          reason: "Pre-kidding (30 days before due date)", milkClearDate: addDaysIso(date, m?.milkWithdrawalDays ?? 0), meatClearDate: addDaysIso(date, m?.meatWithdrawalDays ?? 0),
          givenBy: givenBy || null, notes: null };
      });
      const created = await this.logTreatments(rows);
      await this.update("breedings", breedingId, { prekidDate: date });
      return created;
    });
  }
  /** Change a doe's milk status. Milking / mastitis / drying keep (or start) her lactation; Dry ends it.
      fresh=true (a kidding) always starts a new lactation on that date. */
  async setMilkStatus(animalId: number, status: string | null, date: string, fresh = false) {
    return tx(async () => {
      const open: any = await get("SELECT * FROM lactations WHERE animal_id = ? AND end_date IS NULL ORDER BY start_date DESC LIMIT 1", animalId);
      const milking = !!status && IN_MILK.includes(status);
      if (milking) {
        if (fresh && open && open.start_date !== date) {
          // Kidded again while an older lactation was still open: close it the day before
          const prev = new Date(date + "T12:00:00Z"); prev.setUTCDate(prev.getUTCDate() - 1);
          const end = prev.toISOString().slice(0, 10);
          await run("UPDATE lactations SET end_date = ? WHERE id = ?", end < open.start_date ? open.start_date : end, open.id);
        }
        const stillOpen = fresh ? (open && open.start_date === date ? open : null) : open;
        if (!stillOpen) {
          const dup: any = await get("SELECT id FROM lactations WHERE animal_id = ? AND start_date = ?", animalId, date);
          if (dup) await run("UPDATE lactations SET end_date = NULL WHERE id = ?", dup.id);
          else await run("INSERT INTO lactations (animal_id, start_date) VALUES (?, ?)", animalId, date);
        }
      } else if (open) {
        await run("UPDATE lactations SET end_date = ? WHERE id = ?", date < open.start_date ? open.start_date : date, open.id);
      }
      const [row] = await db.update(s.animals).set({ milkStatus: status, milkStatusDate: date, inMilk: milking }).where(eq(s.animals.id, animalId)).returning();
      return row;
    });
  }
  /** Create or update a breeding, keeping tank straw counts in sync. */
  async saveBreeding(data: any, id?: number) {
    return tx(async () => {
      const [prev]: any[] = id ? await db.select().from(s.breedings).where(eq(s.breedings.id, id)) : [null];
      if (prev) await this.restoreStraws(prev);
      const row = { ...data };
      if (row.buckSource === "frozen") row.straws = Math.max(1, Math.floor(Number(row.straws) || 1));
      else row.straws = null;
      const saved = prev ? await this.update("breedings", id!, row) : await this.create("breedings", row);
      if (saved.buckSource === "frozen" && saved.buckRefId && saved.straws) await this.adjustStraws(saved.buckRefId, -saved.straws);
      return saved;
    });
  }
  /** Save a milk test day. merge=false replaces the listed does' records for that date; merge=true only fills the milk-outs sent. */
  async saveMilkTest(date: string, rows: { animalId: number; out1?: number | null; out2?: number | null; out3?: number | null }[], merge = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Pick a test date");
    const month = date.slice(0, 7);
    const others = (await all<{ date: string }>("SELECT DISTINCT date FROM milk WHERE substr(date,1,7) = ? AND date <> ? ORDER BY date", month, date)).map((r) => r.date);
    if (others.length >= MAX_TESTS_PER_MONTH) {
      const nice = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      throw new Error(`${new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })} already has ${MAX_TESTS_PER_MONTH} milk tests (${others.map(nice).join(" and ")}). Add to one of those dates instead.`);
    }
    const num = (v: any) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
    return tx(async () => {
      const saved: any[] = [];
      for (const r of rows) {
        const [prev]: any[] = await db.select().from(s.milk).where(and(eq(s.milk.animalId, r.animalId), eq(s.milk.date, date)));
        const next: any = { out1: null, out2: null, out3: null, ...(merge && prev ? { out1: prev.out1, out2: prev.out2, out3: prev.out3 } : {}) };
        for (const k of ["out1", "out2", "out3"] as const) if (!merge || k in r) next[k] = num((r as any)[k]);
        const outs = [next.out1, next.out2, next.out3].filter((x) => x !== null);
        if (!outs.length) { if (prev) await db.delete(s.milk).where(eq(s.milk.id, prev.id)); continue; }
        const row = { ...next, lbs: Math.round(outs.reduce((a: number, b: number) => a + b, 0) * 100) / 100 };
        const [out] = prev ? await db.update(s.milk).set(row).where(eq(s.milk.id, prev.id)).returning() : await db.insert(s.milk).values({ animalId: r.animalId, date, ...row }).returning();
        saved.push(out);
      }
      return saved;
    });
  }
  async deleteMilkTest(date: string) {
    await db.delete(s.milk).where(eq(s.milk.date, date));
  }
  async restoreStraws(b: any) {
    if (b?.buckSource === "frozen" && b.buckRefId && b.straws) await this.adjustStraws(b.buckRefId, b.straws);
  }
  async adjustStraws(buckId: number, delta: number) {
    await db.update(s.outsideBucks)
      .set({ strawsOnHand: sql`greatest(0, coalesce(${s.outsideBucks.strawsOnHand}, 0) + ${delta})` })
      .where(eq(s.outsideBucks.id, buckId));
  }
  async adjustStock(medId: number, deltaMl: number) {
    await db.update(s.medications)
      .set({ onHandMl: sql`greatest(0, coalesce(${s.medications.onHandMl}, 0) + ${deltaMl})` })
      .where(eq(s.medications.id, medId));
  }
  listPapers(animalId: number) {
    return all("SELECT id, animal_id AS \"animalId\", date, label, thumb FROM animal_papers WHERE animal_id = ? ORDER BY date DESC, id DESC", animalId);
  }
  paperFull(id: number) {
    return get<{ full: string }>("SELECT \"full\" FROM animal_papers WHERE id = ?", id);
  }
  async addPaper(p: { animalId: number; date: string; label?: string | null; full: string; thumb: string }) {
    const r: any = await get("INSERT INTO animal_papers (animal_id, date, label, \"full\", thumb) VALUES (?, ?, ?, ?, ?) RETURNING id", p.animalId, p.date, p.label ?? null, p.full, p.thumb);
    return { id: Number(r.id) };
  }
  async updatePaper(id: number, label: string | null) { await run("UPDATE animal_papers SET label = ? WHERE id = ?", label, id); }
  async deletePaper(id: number) { await run("DELETE FROM animal_papers WHERE id = ?", id); }
  listPhotos(animalId: number) {
    return all("SELECT id, animal_id AS \"animalId\", date, caption, thumb FROM animal_photos WHERE animal_id = ? ORDER BY date DESC, id DESC", animalId);
  }
  photoFull(id: number) {
    return get<{ full: string }>("SELECT \"full\" FROM animal_photos WHERE id = ?", id);
  }
  async photoThumbs(ids: number[]) {
    if (!ids.length) return [];
    return all<{ id: number; thumb: string }>(`SELECT id, COALESCE(mini, thumb) AS thumb FROM animal_photos WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  }
  async addPhoto(p: { animalId: number; date: string; caption?: string | null; full: string; thumb: string; mini?: string | null }, makeProfile: boolean) {
    return tx(async () => {
      const r: any = await get("INSERT INTO animal_photos (animal_id, date, caption, \"full\", thumb, mini) VALUES (?, ?, ?, ?, ?, ?) RETURNING id", p.animalId, p.date, p.caption ?? null, p.full, p.thumb, p.mini ?? null);
      const id = Number(r.id);
      const a: any = await get("SELECT photo_id FROM animals WHERE id = ?", p.animalId);
      if (makeProfile || !a?.photo_id) await run("UPDATE animals SET photo_id = ? WHERE id = ?", id, p.animalId);
      return { id };
    });
  }
  async updatePhoto(id: number, caption: string | null) {
    await run("UPDATE animal_photos SET caption = ? WHERE id = ?", caption, id);
  }
  async deletePhoto(id: number) {
    await tx(async () => {
      const row: any = await get("SELECT animal_id FROM animal_photos WHERE id = ?", id);
      await run("DELETE FROM animal_photos WHERE id = ?", id);
      if (row) {
        const a: any = await get("SELECT photo_id FROM animals WHERE id = ?", row.animal_id);
        if (a?.photo_id === id) {
          const next: any = await get("SELECT id FROM animal_photos WHERE animal_id = ? ORDER BY date DESC, id DESC LIMIT 1", row.animal_id);
          await run("UPDATE animals SET photo_id = ? WHERE id = ?", next?.id ?? null, row.animal_id);
        }
      }
    });
  }
  async clearAll() {
    const names = Object.values(resources).map((r: any) => `"${getTableName(r.table)}"`).concat(['"animal_photos"', '"animal_papers"']);
    await run(`TRUNCATE ${names.join(", ")} RESTART IDENTITY`);
  }
  async isEmpty() {
    const r: any = await get("SELECT (SELECT count(*) FROM animals) + (SELECT count(*) FROM medications) AS n");
    return Number(r?.n ?? 0) === 0;
  }
}

function addHoursIso(date: string, time: string, h: number) {
  const d = new Date(`${date}T${/^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "08:00"}:00Z`);
  d.setUTCHours(d.getUTCHours() + h);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}
function addDaysIso(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const storage = new DatabaseStorage();
/** Today's date on the farm (Eastern time), as YYYY-MM-DD */
function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
