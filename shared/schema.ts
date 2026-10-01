import { pgSchema, text, integer, doublePrecision, boolean, serial } from "drizzle-orm/pg-core";

export const herd = pgSchema("herd");
const sqliteTable = herd.table;
import { createInsertSchema } from "drizzle-zod";
import type * as z from "zod/mini";

export const animals = sqliteTable("animals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tag: text("tag"),
  regNumber: text("reg_number"),
  pedigree: text("pedigree"), // JSON: ancestors not in the herd, by path (S, D, SS, SD, … DDD) → {name, reg}
  earType: text("ear_type"), // Lamancha: Gopher | Elf; other breeds: Erect | Airplane | Pendulous | anything else typed in
  herdbook: text("herdbook"), // ADGA herdbook: Purebred | American | Experimental | Grade
  sex: text("sex").notNull().default("doe"), // doe | buck | wether
  breed: text("breed").default("Oberhasli"),
  dob: text("dob"),
  color: text("color"),
  eyeColor: text("eye_color").default("Brown"),
  hornStatus: text("horn_status").default("disbudded"), // disbudded | polled | horned | scurs
  tattooLocation: text("tattoo_location").default("ear"), // ear | tail
  tattooRight: text("tattoo_right"),
  tattooLeft: text("tattoo_left"),
  barnName: text("barn_name"),
  chipLocation: text("chip_location").default("ear"), // ear (base of ear) | tail
  microchip: text("microchip"),
  photoId: integer("photo_id"), // profile snapshot
  status: text("status").notNull().default("active"), // active | sold | deceased
  statusDate: text("status_date"), // date sold or died
  buyerName: text("buyer_name"),
  buyerPhone: text("buyer_phone"),
  buyerEmail: text("buyer_email"),
  buyerAddress: text("buyer_address"),
  salePrice: doublePrecision("sale_price"),
  deathCause: text("death_cause"), // cause of death note
  groupName: text("group_name"),
  pastureId: integer("pasture_id"),
  sire: text("sire"),
  dam: text("dam"),
  inMilk: boolean("in_milk").default(false), // true while milking, mastitis or drying up
  milkStatus: text("milk_status"), // milking | mastitis | drying | dry | null (not freshened)
  milkStatusDate: text("milk_status_date"),
  pedigreeUrl: text("pedigree_url"),
  notes: text("notes"),
  cdtFromBirth: boolean("cdt_from_birth").default(false), // newborn entered in the app: kid CD&T series counts from the birth date
  calfPro: integer("calf_pro"), // kid Calf-Pro program: null = automatic (born on/after the program start), 1 = on, 0 = off
});

export const photos = sqliteTable("animal_photos", {
  id: serial("id").primaryKey(),
  animalId: integer("animal_id").notNull(),
  date: text("date").notNull(),
  caption: text("caption"),
  full: text("full").notNull(), // JPEG as data URL
  thumb: text("thumb").notNull(),
  mini: text("mini"),
});

export const weights = sqliteTable("weights", {
  id: serial("id").primaryKey(),
  animalId: integer("animal_id").notNull(),
  date: text("date").notNull(),
  lbs: doublePrecision("lbs").notNull(),
  method: text("method").default("scale"),
});

export const medications = sqliteTable("medications", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").default("Antibiotic"),
  concentration: doublePrecision("concentration"), // mg per mL
  doseAmount: doublePrecision("dose_amount").notNull(),
  doseUnit: text("dose_unit").notNull().default("mg/lb"), // mg/lb | mL/100lb | mL/head
  route: text("route").default("SQ"),
  repeatDays: integer("repeat_days"), // interval between doses, in repeatUnit
  repeatUnit: text("repeat_unit").default("days"), // days | hours
  repeatTimes: integer("repeat_times").default(0), // how many repeat doses after the first
  milkWithdrawalDays: integer("milk_withdrawal_days").default(0),
  meatWithdrawalDays: integer("meat_withdrawal_days").default(0),
  onHandMl: doublePrecision("on_hand_ml").default(0),
  reorderAtMl: doublePrecision("reorder_at_ml").default(0),
  vetConfirmed: boolean("vet_confirmed").default(false),
  notes: text("notes"),
  // Tablets/capsules dosed in mg (dose_unit "tab-mg"): sizes on hand, e.g. "7.5, 15"
  tabletSizes: text("tablet_sizes"),
  tabletSplit: boolean("tablet_split").default(false), // tablets can be cut in half
  dosePerLbs: doublePrecision("dose_per_lbs"), // mg dose is per this many lb (blank = per head)
  firstDoseAmount: doublePrecision("first_dose_amount"), // a different first (loading) dose, mg
  pillForm: text("pill_form").default("tablet"), // tablet | capsule
});

export const treatments = sqliteTable("treatments", {
  id: serial("id").primaryKey(),
  animalId: integer("animal_id").notNull(),
  medicationId: integer("medication_id"),
  medName: text("med_name").notNull(),
  date: text("date").notNull(),
  time: text("time"), // HH:MM given (optional)
  weightLbs: doublePrecision("weight_lbs"),
  tempF: doublePrecision("temp_f"), // optional body temperature at treatment, °F
  doseMl: doublePrecision("dose_ml"),
  drops: integer("drops"), // eye meds: drops given (dose_ml stays empty)
  pillCount: doublePrecision("pill_count"), // oral meds given as capsules or tablets (can be ½)
  pillUnit: text("pill_unit"), // capsule | tablet | tube (intramammary, per side)
  doseMg: doublePrecision("dose_mg"), // tablet doses: the mg given
  doseDetail: text("dose_detail"), // tablet doses: "22.5 mg: 1 × 15 mg + 1 × 7.5 mg tablets"
  side: text("side"), // eye and udder treatments: Left | Right | Both
  route: text("route"),
  reason: text("reason"),
  milkClearDate: text("milk_clear_date"),
  meatClearDate: text("meat_clear_date"),
  nextDoseDate: text("next_dose_date"),
  givenBy: text("given_by"),
  batchId: text("batch_id"),
  doseNo: integer("dose_no"),
  doseTotal: integer("dose_total"),
  notes: text("notes"),
});

export const breedings = sqliteTable("breedings", {
  id: serial("id").primaryKey(),
  doeId: integer("doe_id").notNull(),
  buck: text("buck").notNull(),
  date: text("date").notNull(),
  method: text("method").default("Pen"),
  dueDate: text("due_date"),
  status: text("status").notNull().default("bred"), // bred | confirmed | kidded | open
  kiddingDate: text("kidding_date"),
  kidsBorn: integer("kids_born"),
  buckSource: text("buck_source").default("herd"), // herd | guest | frozen
  buckRefId: integer("buck_ref_id"), // animals.id (herd) or outsideBucks.id (guest/frozen)
  straws: integer("straws"), // straws used (AI)
  usDate: text("us_date"), // ultrasound done on
  usResult: text("us_result"), // positive | negative | recheck
  usNotes: text("us_notes"),
  prekidDate: text("prekid_date"), // CDT + BoSe given before kidding
  notes: text("notes"),
});

/** Bucks not in the herd: guest bucks from other farms (live cover) and frozen semen in the tank (AI) */
export const outsideBucks = sqliteTable("outside_bucks", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("guest"), // guest | frozen
  name: text("name").notNull(),
  regNumber: text("reg_number"),
  breed: text("breed").default("Oberhasli"),
  farm: text("farm"), // owner / source
  pedigreeUrl: text("pedigree_url"),
  startingStraws: integer("starting_straws").default(0),
  strawsOnHand: integer("straws_on_hand").default(0),
  canister: text("canister"),
  collectionDate: text("collection_date"),
  active: boolean("active").default(true),
  notes: text("notes"),
});
export const insertOutsideBuckSchema = createInsertSchema(outsideBucks).omit({ id: true });
export type OutsideBuck = typeof outsideBucks.$inferSelect;

export const milk = sqliteTable("milk", {
  id: serial("id").primaryKey(),
  animalId: integer("animal_id").notNull(),
  date: text("date").notNull(), // milk test day (max 2 per month)
  out1: doublePrecision("out1"), // milk-out 1 (lb)
  out2: doublePrecision("out2"), // milk-out 2 (lb)
  out3: doublePrecision("out3"), // milk-out 3 (lb)
  lbs: doublePrecision("lbs").notNull().default(0), // test-day total = sum of milk-outs
  notes: text("notes"),
});

export const tasks = sqliteTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  dueDate: text("due_date").notNull(),
  dueTime: text("due_time"), // HH:MM for doses given more than once a day
  animalId: integer("animal_id"),
  done: boolean("done").default(false),
  kind: text("kind").default("task"), // task | dose
  medicationId: integer("medication_id"),
  batchId: text("batch_id"),
  animalIds: text("animal_ids"), // comma-separated, for repeat doses
  doseNo: integer("dose_no"),
  doseTotal: integer("dose_total"),
  skipped: boolean("skipped").default(false), // repeat dose skipped on purpose (not given)
  // Open-ended reminders (brought over from EasyKeeper): what to give, and how often it comes back
  medName: text("med_name"),
  doseText: text("dose_text"), // dosage as written, e.g. "4.4 Val / 9.9 Cyd"
  doseMl: doublePrecision("dose_ml"),
  drops: integer("drops"),
  route: text("route"),
  notes: text("notes"),
  repeatEvery: integer("repeat_every"), // days (or hours, see repeatUnit); when done or skipped, the next one is added
  repeatUnit: text("repeat_unit").default("days"), // "days" | "hours"
  reeval: boolean("reeval").default(false), // ask to re-evaluate the goat before this dose (continue or stop)
  source: text("source"), // e.g. EK-REM-70806
});

export const pastures = sqliteTable("pastures", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  acres: doublePrecision("acres"),
  notes: text("notes"),
});

export const pastureMoves = sqliteTable("pasture_moves", {
  id: serial("id").primaryKey(),
  animalId: integer("animal_id").notNull(),
  fromPastureId: integer("from_pasture_id"),
  toPastureId: integer("to_pasture_id"),
  date: text("date").notNull(),
});

export const insertPastureSchema = createInsertSchema(pastures).omit({ id: true });
export const insertPastureMoveSchema = createInsertSchema(pastureMoves).omit({ id: true });
export type Pasture = typeof pastures.$inferSelect;
export type PastureMove = typeof pastureMoves.$inferSelect;

export const insertAnimalSchema = createInsertSchema(animals).omit({ id: true });
export const insertWeightSchema = createInsertSchema(weights).omit({ id: true });
export const insertMedicationSchema = createInsertSchema(medications).omit({ id: true });
export const insertTreatmentSchema = createInsertSchema(treatments).omit({ id: true });
export const insertBreedingSchema = createInsertSchema(breedings).omit({ id: true });
export const insertMilkSchema = createInsertSchema(milk).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true });

export type Animal = typeof animals.$inferSelect;
export type Weight = typeof weights.$inferSelect;
export type Medication = typeof medications.$inferSelect;
export type Treatment = typeof treatments.$inferSelect;
export type Breeding = typeof breedings.$inferSelect;
export type Milk = typeof milk.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type InsertAnimal = z.infer<typeof insertAnimalSchema>;
export type InsertTreatment = z.infer<typeof insertTreatmentSchema>;

/** Observed heats (estrus) for does */
export const heats = sqliteTable("heats", {
  id: serial("id").primaryKey(),
  doeId: integer("doe_id").notNull(),
  date: text("date").notNull(),
  strength: text("strength").default("normal"), // weak | normal | strong
  signs: text("signs"), // comma-separated: flagging, mucus, bleating, mounting, standing, off feed, milk drop, buck interest
  notes: text("notes"),
});
export const insertHeatSchema = createInsertSchema(heats).omit({ id: true });
export type Heat = typeof heats.$inferSelect;

/** Show results for an animal */
export const shows = sqliteTable("shows", {
  id: serial("id").primaryKey(),
  animalId: integer("animal_id").notNull(),
  date: text("date").notNull(),
  showName: text("show_name").notNull(),
  className: text("class_name"), // group / class shown in
  placing: text("placing"),
  notes: text("notes"),
});
export const insertShowSchema = createInsertSchema(shows).omit({ id: true });
export type Show = typeof shows.$inferSelect;

/** Free-form dated notes about an animal ("Other" tab) */
export const animalNotes = sqliteTable("animal_notes", {
  id: serial("id").primaryKey(),
  animalId: integer("animal_id").notNull(),
  date: text("date").notNull(),
  note: text("note").notNull(),
  enteredBy: text("entered_by"),
});
export const insertAnimalNoteSchema = createInsertSchema(animalNotes).omit({ id: true });
export type AnimalNote = typeof animalNotes.$inferSelect;

// One row per lactation: starts when she freshens, ends the day she is marked Dry. Days in milk come from these.
export const lactations = sqliteTable("lactations", {
  id: serial("id").primaryKey(),
  animalId: integer("animal_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  notes: text("notes"),
});
export const insertLactationSchema = createInsertSchema(lactations).omit({ id: true });
export type Lactation = typeof lactations.$inferSelect;

// Everyday goat-keeping jobs checked off per goat: hoof trims, FAMACHA, body condition, clipping, tests…
export const care = sqliteTable("care_records", {
  id: serial("id").primaryKey(),
  animalId: integer("animal_id").notNull(),
  date: text("date").notNull(),
  kind: text("kind").notNull(), // e.g. "Hoof trim", "FAMACHA", "Body condition"
  score: text("score"), // FAMACHA 1-5, body condition 1-5, or a short result
  notes: text("notes"),
  doneBy: text("done_by"),
  batchId: text("batch_id"),
});
export const insertCareSchema = createInsertSchema(care).omit({ id: true });
export type Care = typeof care.$inferSelect;

// Breeding plan: which buck each doe is planned to go to for a season
export const breedingPlans = sqliteTable("breeding_plans", {
  id: serial("id").primaryKey(),
  season: text("season").notNull(), // e.g. "2026"
  doeId: integer("doe_id").notNull(),
  buckSource: text("buck_source"), // herd | frozen | guest | other
  buckRefId: integer("buck_ref_id"), // animals.id (herd) or outsideBucks.id (frozen/guest)
  buck: text("buck"), // name, or the typed-in name for Other
  notes: text("notes"),
});
export const insertBreedingPlanSchema = createInsertSchema(breedingPlans).omit({ id: true });
export type BreedingPlan = typeof breedingPlans.$inferSelect;

/** Farm phone list: vet, feed store, hay, shearer, helpers */
export const contacts = sqliteTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  role: text("role"),
});
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true });
export type Contact = typeof contacts.$inferSelect;
