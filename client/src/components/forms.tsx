import { useEffect, useRef, useState, type ReactNode } from "react";
import { WeightCheck, weightOk } from "@/components/weight-check";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useBarnHours } from "@/components/barn-hours";
import {
  useList, useSave, post, today, addDays, calcDoseMl, latestWeight, isWeightDosed, saveDoseWeights, tabletDose, tabletSizes, tabletFields, isTabletMg, type TabletDose, perKg, LB_PER_KG, DOSE_UNITS, GESTATION_DAYS, shortName, doseSchedule, dosesInDays, fmtShort, fmtTime, nowTime, repeatText, type RepeatUnit, type BarnHours,
  type Animal, type Medication, type Breeding, type OutsideBuck, type Heat, HEAT_SIGNS, doseRuleText, heatDates, heatInterval, useRemove, fmtDate, ULTRASOUND_DAYS, PREKID_DAYS, RECHECK_DAYS, usDue, US_LABEL, goatName, regName, matchesAnimal, idMatch, isDrops, pillUnitOf, ORAL_UNITS, hasSide, SIDES, TUBE_AMOUNTS } from "@/lib/herd";
import { ExternalLink, Plus, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { invalidateAll, tempNote } from "@/lib/herd";
import { findParent, kidBreed, kidHerdbook, defaultTattooLocation, isLaMancha, earOptions } from "@shared/breed";

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Pick({ value, onChange, options, placeholder, testId }: {
  value?: string | null; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; testId?: string;
}) {
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}><SelectValue placeholder={placeholder ?? "Select"} /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Rank goats for a typed search: tattoo / tag / chip hits first, then barn names that start with the words, then any match */
export function rankGoats(list: Animal[], q: string) {
  const t = q.trim();
  const sorted = [...list].sort((a, b) => goatName(a).localeCompare(goatName(b), undefined, { numeric: true }));
  if (!t) return sorted;
  const low = t.toLowerCase(), single = !/\s/.test(t);
  return sorted
    .map((a) => {
      const id = single ? idMatch(a, t)?.score ?? 0 : 0;
      const nm = goatName(a).toLowerCase(), reg = (a.name ?? "").toLowerCase();
      const word = (s: string) => s.startsWith(low) || s.includes(" " + low);
      const name = nm.split(/[\s\-()]+/)[0] === low ? 70 : nm.startsWith(low) ? 60 : word(nm) ? 45 : word(reg) ? 30 : nm.includes(low) || reg.includes(low) ? 20 : 0;
      const any = id || name || matchesAnimal(a, t) ? 1 : 0;
      return { a, s: id + name + any };
    })
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a);
}
/** Goat picker you can type in: barn name, registered name, tattoo, tag, microchip or reg # */
export function GoatPick({ value, onChange, goats, placeholder = "Choose a goat", testId }: {
  value?: string | number | null; onChange: (id: string) => void; goats: Animal[]; placeholder?: string; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const cur = goats.find((a) => String(a.id) === String(value ?? ""));
  const list = rankGoats(goats, q).slice(0, 60);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm" data-testid={testId}>
          <span className={`truncate ${cur ? "" : "text-muted-foreground"}`}>{cur ? <>{goatName(cur)}{cur.tag ? ` · #${cur.tag}` : ""}</> : placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <div className="border-b p-2"><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name, tattoo or tag…" className="h-9" data-testid={testId ? `${testId}-search` : undefined}
          onKeyDown={(e) => { if (e.key === "Enter" && list[0]) { e.preventDefault(); onChange(String(list[0].id)); setOpen(false); setQ(""); } }} /></div>
        <ul className="max-h-72 overflow-y-auto py-1" role="listbox">
          {list.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No goats match “{q}”</li>}
          {list.map((a) => { const r = regName(a); return (
            <li key={a.id}>
              <button type="button" onClick={() => { onChange(String(a.id)); setOpen(false); setQ(""); }} className={`w-full px-3 py-2 text-left text-sm hover-elevate ${String(a.id) === String(value ?? "") ? "bg-primary/10" : ""}`} data-testid={`option-goat-${a.id}`}>
                <span className="font-medium">{goatName(a)}</span>{a.tag ? <span className="text-muted-foreground"> · #{a.tag}</span> : null}
                {r && <span className="ml-1.5 text-xs text-muted-foreground">{r}</span>}
              </button>
            </li>
          ); })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Medicines that match what's typed: name start first, then a word start, then anywhere (spaces and dashes ignored) */
export function rankMeds(list: Medication[], q: string) {
  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
  const low = q.trim().toLowerCase(); if (!low) return sorted;
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const f = flat(low);
  const score = (m: Medication) => {
    const n = m.name.toLowerCase(), words = n.split(/[^a-z0-9]+/).filter(Boolean);
    if (n.startsWith(low) || flat(n).startsWith(f)) return 3;
    if (words.some((w) => w.startsWith(low))) return 2;
    if (f && flat(n).includes(f)) return 1;
    if (f && [m.category, m.route, m.notes].some((x) => x && flat(x).includes(f))) return 0.5;
    return 0;
  };
  return sorted.map((m) => [m, score(m)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([m]) => m);
}
/** Type-to-search medicine chooser */
export function MedPick({ value, onChange, meds, placeholder = "Choose a medication", testId }: {
  value?: string | number | null; onChange: (id: string) => void; meds: Medication[]; placeholder?: string; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const cur = meds.find((m) => String(m.id) === String(value ?? ""));
  const list = rankMeds(meds, q);
  const pick = (id: number) => { onChange(String(id)); setOpen(false); setQ(""); };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm" data-testid={testId}>
          <span className={`truncate ${cur ? "" : "text-muted-foreground"}`}>{cur ? cur.name : placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <div className="border-b p-2"><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing a medicine…" className="h-9" data-testid={testId ? `${testId}-search` : undefined}
          onKeyDown={(e) => { if (e.key === "Enter" && list[0]) { e.preventDefault(); pick(list[0].id); } }} /></div>
        <ul className="max-h-72 overflow-y-auto py-1" role="listbox">
          {list.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No medicines match “{q}”</li>}
          {list.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => pick(m.id)} className={`w-full px-3 py-2 text-left text-sm hover-elevate ${String(m.id) === String(value ?? "") ? "bg-primary/10" : ""}`} data-testid={`option-med-${m.id}`}>
                <span className="font-medium">{m.name}</span>
                <span className="block text-xs text-muted-foreground">{[m.category, m.route, doseRuleText(m)].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Repeat-dose controls: "repeat N more times, every E days/hours", quick presets (twice daily, hourly…), and a dose-time preview */
const PRESETS: { label: string; every: number; unit: RepeatUnit }[] = [
  { label: "Once a day", every: 1, unit: "days" }, { label: "Twice a day", every: 12, unit: "hours" }, { label: "3× a day", every: 8, unit: "hours" },
  { label: "4× a day", every: 6, unit: "hours" }, { label: "Every 2 hours", every: 2, unit: "hours" }, { label: "Hourly", every: 1, unit: "hours" },
];
/** The dose times RepeatFields will save (so what's saved matches the preview) */
export function repeatPlan(start: string, times: string, every: string, unit: RepeatUnit, time: string, barn: BarnHours | null) {
  const n = Math.max(0, Math.min(1000, Math.floor(Number(times) || 0)));
  const d = Math.max(0, Math.floor(Number(every) || 0));
  return doseSchedule(start, n, d, unit, time || "08:00", unit === "hours" ? barn : null);
}
export function RepeatFields({ start, times, every, unit, time, onTimes, onEvery, onUnit, onTime, barnOn, onBarnOn, ongoing = false, onOngoing, reeval = false, onReeval }: {
  start: string; times: string; every: string; unit: RepeatUnit; time: string;
  onTimes: (v: string) => void; onEvery: (v: string) => void; onUnit: (v: RepeatUnit) => void; onTime: (v: string) => void;
  barnOn: boolean; onBarnOn: (v: boolean) => void;
  ongoing?: boolean; onOngoing?: (v: boolean) => void; reeval?: boolean; onReeval?: (v: boolean) => void;
}) {
  const n = ongoing ? 1 : Math.max(0, Math.min(1000, Math.floor(Number(times) || 0)));
  const d = Math.max(0, Math.floor(Number(every) || 0));
  const hours = unit === "hours";
  const { hours: barn, save: saveBarn } = useBarnHours();
  const [editBarn, setEditBarn] = useState(false);
  const useBarn = hours && barnOn;
  const dates = repeatPlan(start, ongoing ? "1" : times, every, unit, time, useBarn ? barn : null);
  const [runDays, setRunDays] = useState("");
  // "for X days": count the doses that fit in X days (skipping the night when barn hours are on), minus the first one
  const runFor = (x: string, bh: BarnHours | null = useBarn ? barn : null, ev = d, un = unit) => {
    const days = Number(x);
    if (!(days > 0) || !(ev > 0)) return;
    onTimes(String(Math.max(0, dosesInDays(start, time || "08:00", days, ev, un, un === "hours" ? bh : null) - 1)));
  };
  const applyRun = (x: string) => { setRunDays(x); runFor(x); };
  useEffect(() => { if (runDays) runFor(runDays); }, [barnOn, barn.start, barn.end, time, start]); // eslint-disable-line
  const pick = (p: (typeof PRESETS)[number]) => {
    onUnit(p.unit); onEvery(String(p.every));
    const on = p.unit === "hours" && (p.every <= 2 || p.every === 12); onBarnOn(on); // hourly, every-2-hour and twice-daily treatments stay inside barn hours
    if (ongoing) return;
    if (runDays) runFor(runDays, on ? barn : null, p.every, p.unit);
    else if (!n) onTimes(p.unit === "hours" ? String(Math.max(1, dosesInDays(start, time || "08:00", 1, p.every, "hours", on ? barn : null) - 1)) : "2");
  };
  const fmt = (x: { date: string; time: string | null }) => `${fmtShort(x.date)}${x.time ? ` ${fmtTime(x.time)}` : ""}`;
  const shown = dates.length > 8 ? [...dates.slice(0, 6).map(fmt), "…", fmt(dates[dates.length - 1])] : dates.map(fmt);
  return (
    <div className="rounded-md border p-3" data-testid="repeat-fields">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Repeat doses</span>
        {onOngoing && (
          <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label="How long to repeat">
            <button type="button" onClick={() => onOngoing(false)} className={`rounded px-2 py-1 font-semibold ${!ongoing ? "bg-primary text-primary-foreground" : ""}`} data-testid="button-repeat-count">Set number</button>
            <button type="button" onClick={() => { onOngoing(true); if (!(d > 0)) { onEvery("1"); onUnit("days"); } }} className={`rounded px-2 py-1 font-semibold ${ongoing ? "bg-primary text-primary-foreground" : ""}`} data-testid="button-repeat-ongoing">Until resolved</button>
          </div>
        )}
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const on = d === p.every && unit === p.unit && n > 0;
          return <button key={p.label} type="button" onClick={() => pick(p)} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary"}`} data-testid={`chip-repeat-${p.label.toLowerCase().replace(/\W+/g, "-")}`}>{p.label}</button>;
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {ongoing ? <span>Repeat until resolved,</span> : <>
        <span>Repeat</span>
        <Input type="number" inputMode="numeric" min={0} className="h-9 w-16 px-1 text-center tabular-nums" value={times} onChange={(e) => { onTimes(e.target.value); setRunDays(""); }} data-testid="input-repeat-times" aria-label="Number of repeat doses" />
        <span>more time{n === 1 ? "" : "s"},</span></>}
        <span className="inline-flex items-center gap-2 whitespace-nowrap">every
        <Input type="number" inputMode="numeric" min={1} className="h-9 w-14 text-center tabular-nums" value={every} onChange={(e) => onEvery(e.target.value)} data-testid="input-repeat-every" aria-label="Time between doses" />
        <select value={unit} onChange={(e) => onUnit(e.target.value as RepeatUnit)} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Days or hours" data-testid="select-repeat-unit">
          <option value="days">days</option><option value="hours">hours</option>
        </select></span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {hours && <><span>First dose at</span><Input type="time" className="h-9 w-32" value={time} onChange={(e) => onTime(e.target.value)} data-testid="input-repeat-time" aria-label="Time of first dose" /></>}
        {!ongoing && <span className="inline-flex items-center gap-2 whitespace-nowrap">{hours ? "for" : "Or run for"}
        <Input type="number" inputMode="numeric" min={1} className="h-9 w-14 text-center tabular-nums" value={runDays} onChange={(e) => applyRun(e.target.value)} placeholder="—" data-testid="input-repeat-days" aria-label="Number of days" />
        {Number(runDays) === 1 ? "day" : "days"}</span>}
      </div>
      {hours && (
        <div className="mt-2 rounded-md bg-muted/60 px-2.5 py-2 text-sm" data-testid="barn-hours">
          <label className="flex items-center gap-2">
            <Checkbox checked={barnOn} onCheckedChange={(c) => onBarnOn(!!c)} data-testid="checkbox-barn-hours" />
            <span>Only during barn hours, <span className="font-semibold">{fmtTime(barn.start)} to {fmtTime(barn.end)}</span></span>
            <button type="button" className="ml-auto text-xs text-primary hover:underline" onClick={() => setEditBarn(!editBarn)} data-testid="button-edit-barn-hours">{editBarn ? "Done" : "Change"}</button>
          </label>
          {editBarn && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span>From</span><Input type="time" className="h-8 w-28" value={barn.start} onChange={(e) => e.target.value && saveBarn.mutate({ ...barn, start: e.target.value })} data-testid="input-barn-start" />
              <span>to</span><Input type="time" className="h-8 w-28" value={barn.end} onChange={(e) => e.target.value && saveBarn.mutate({ ...barn, end: e.target.value })} data-testid="input-barn-end" />
              <span className="text-muted-foreground">Saved for every treatment</span>
            </div>
          )}
          {barnOn && <p className="mt-1 text-xs text-muted-foreground">{d >= 8 ? <>A dose due shortly after {fmtTime(barn.end)} is given at {fmtTime(barn.end)}; later ones wait until {fmtTime(barn.start)} the next morning.</> : <>Doses that would fall overnight start again at {fmtTime(barn.start)} the next morning.</>}</p>}
        </div>
      )}
      {onReeval && (n > 0 || ongoing) && (
        <label className="mt-2 flex items-start gap-2 text-sm" data-testid="label-reeval">
          <Checkbox checked={reeval} onCheckedChange={(c) => onReeval(!!c)} className="mt-0.5" data-testid="checkbox-reeval" />
          <span>Re-evaluate at each dose<span className="block text-xs text-muted-foreground">Before each repeat you'll be asked how the goat is doing: keep going, give this one as the last dose, or stop.</span></span>
        </label>
      )}
      <p className="mt-2 text-xs text-muted-foreground" data-testid="text-repeat-preview">
        {ongoing && d > 0
          ? <>{repeatText(d, unit)[0].toUpperCase() + repeatText(d, unit).slice(1)} until resolved. Next dose {dates[1] ? fmt(dates[1]) : "—"}; each time a dose is given the next one is added. Stop it from Today when she's better.</>
          : n > 0 && d > 0
          ? <>{n + 1} doses, {repeatText(d, unit)}: {shown.join(", ")}. {hours ? "Today shows the next dose due, with its time." : "Each repeat is added to the Today to-do list."}</>
          : n > 0 ? "Enter the time between doses." : "Single dose. Pick a schedule above or set a number to schedule repeats."}
      </p>
    </div>
  );
}
function useFormState<T extends object>(initial: T, open: boolean) {
  const [v, setV] = useState<T>(initial);
  useEffect(() => { if (open) setV(initial); }, [open]); // eslint-disable-line
  const set = (k: keyof T) => (val: any) => setV((p) => ({ ...p, [k]: val }));
  return [v, set, setV] as const;
}

const num = (s: any) => (s === "" || s === null || s === undefined ? null : Number(s));

/* ---------------- Animal ---------------- */
export const HORN_OPTIONS = [{ value: "disbudded", label: "Disbudded" }, { value: "polled", label: "Polled" }, { value: "horned", label: "Horned" }, { value: "scurs", label: "Scurs" }];
const EAR_OTHER = "__other";
/** Ear type picker: Lamancha → Gopher / Elf; other breeds → Erect / Airplane / Pendulous / Other (type it in) */
function EarTypeField({ breed, value, onChange }: { breed?: string | null; value?: string | null; onChange: (v: string | null) => void }) {
  const opts = earOptions(breed);
  const [other, setOther] = useState(!!value && !opts.includes(value));
  useEffect(() => { if (value && !opts.includes(value)) setOther(true); }, [value, breed]); // eslint-disable-line
  const lam = isLaMancha(breed);
  const pick = !value && !other ? "none" : other || !opts.includes(value!) ? EAR_OTHER : value!;
  return (
    <>
      <Field label="Ear type" hint={lam ? "Lamancha: gopher or elf" : undefined}>
        <Pick value={pick} testId="select-ear-type" onChange={(x) => { if (x === EAR_OTHER) { setOther(true); onChange(value && !opts.includes(value) ? value : ""); } else { setOther(false); onChange(x === "none" ? null : x); } }}
          options={[{ value: "none", label: "Not set" }, ...opts.map((o) => ({ value: o, label: o })), ...(lam && pick !== EAR_OTHER ? [] : [{ value: EAR_OTHER, label: "Other" }])]} />
      </Field>
      {pick === EAR_OTHER && <Field label="Other ear type"><Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="Describe the ears" data-testid="input-ear-other" /></Field>}
    </>
  );
}
/** Extra details once a goat leaves the herd: buyer for a sale, cause for a death, and the date either way */
function StatusDetails({ v, set }: { v: any; set: (k: string) => (x: any) => void }) {
  const sold = v.status === "sold";
  return (
    <div className="col-span-2 rounded-md border p-3" data-testid="status-details">
      <div className="mb-2 text-sm font-semibold">{sold ? "Sale" : "Death"}</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={sold ? "Date sold" : "Date of death"}><Input type="date" value={v.statusDate ?? ""} onChange={(e) => set("statusDate")(e.target.value)} data-testid="input-status-date" /></Field>
        {sold ? (
          <>
            <Field label="Price"><Input inputMode="decimal" value={v.salePrice ?? ""} onChange={(e) => set("salePrice")(e.target.value)} placeholder="$" data-testid="input-sale-price" /></Field>
            <Field label="Buyer name" className="col-span-2"><Input value={v.buyerName ?? ""} onChange={(e) => set("buyerName")(e.target.value)} data-testid="input-buyer-name" /></Field>
            <Field label="Phone"><Input type="tel" value={v.buyerPhone ?? ""} onChange={(e) => set("buyerPhone")(e.target.value)} data-testid="input-buyer-phone" /></Field>
            <Field label="Email"><Input type="email" value={v.buyerEmail ?? ""} onChange={(e) => set("buyerEmail")(e.target.value)} data-testid="input-buyer-email" /></Field>
            <Field label="Address" className="col-span-2"><Textarea rows={2} value={v.buyerAddress ?? ""} onChange={(e) => set("buyerAddress")(e.target.value)} data-testid="input-buyer-address" /></Field>
          </>
        ) : (
          <Field label="Cause of death" className="col-span-2"><Textarea rows={3} value={v.deathCause ?? ""} onChange={(e) => set("deathCause")(e.target.value)} placeholder="What happened, vet findings, necropsy results" data-testid="input-death-cause" /></Field>
        )}
      </div>
    </div>
  );
}
export const EYE_OPTIONS = ["Brown", "Blue", "Amber", "Marbled"];
export function AnimalDialog({ open, onOpenChange, animal }: { open: boolean; onOpenChange: (o: boolean) => void; animal?: Animal }) {
  const save = useSave("animals");
  const { data: pastures = [] } = useList("pastures");
  const { toast } = useToast();
  const [v, set, setV] = useFormState<any>(animal ?? { name: "", sex: "doe", status: "active", breed: "", color: "", eyeColor: "Brown", hornStatus: "disbudded", tattooLocation: "ear", chipLocation: "ear", inMilk: false }, open);
  const { data: herd = [] } = useList("animals");
  const { data: outside = [] } = useList("outsideBucks");
  // Kid's breed and herdbook from its parents (new goats, or while the breed is still the calculated one)
  const [auto, setAuto] = useState<null | { breed: string; herdbook: string | null; from: string }>(null);
  const [breedTouched, setBreedTouched] = useState(false);
  useEffect(() => { if (open) { setAuto(null); setBreedTouched(!!animal); } }, [open]); // eslint-disable-line
  useEffect(() => {
    if (!open || breedTouched) return;
    const dam = findParent(v.dam, herd.filter((a) => a.id !== animal?.id));
    const sire = findParent(v.sire, herd.filter((a) => a.id !== animal?.id)) ?? findParent(v.sire, outside as any[]);
    const kb = dam && sire ? kidBreed(dam.breed, sire.breed) : null;
    if (!dam || !sire || !kb) { setAuto(null); return; }
    const hb = kidHerdbook(dam, sire as any);
    setAuto({ breed: kb, herdbook: hb, from: `${goatName(dam)} (${dam.breed || "?"}) × ${(sire as any).barnName || goatName(sire)} (${sire.breed || "?"})` });
    setV((p: any) => ({ ...p, breed: kb, herdbook: hb ?? p.herdbook ?? null, tattooLocation: defaultTattooLocation(kb) }));
  }, [v.sire, v.dam, open, breedTouched, herd.length, outside.length]); // eslint-disable-line
  const setBreed = (b: string) => {
    setBreedTouched(true); setAuto(null);
    setV((p: any) => ({ ...p, breed: b, tattooLocation: isLaMancha(b) ? "tail" : isLaMancha(p.breed) ? "ear" : p.tattooLocation }));
  };
  // Sold or deceased: the date defaults to today (change it if it happened earlier)
  const setStatus = (x: string) => setV((p: any) => ({ ...p, status: x, statusDate: x === "active" ? null : x === (animal?.status ?? "active") && animal?.statusDate ? animal.statusDate : today() }));
  const submit = async () => {
    if (!v.name?.trim()) return toast({ title: "Name is required", variant: "destructive" });
    if (v.status !== "active" && v.status !== (animal?.status ?? "active") && !v.statusDate) return toast({ title: v.status === "sold" ? "Enter the date sold" : "Enter the date of death", variant: "destructive" });
    const chip = String(v.microchip ?? "").replace(/\D/g, "");
    if (chip && chip.length !== 15) return toast({ title: "Check the microchip number", description: `It has ${chip.length} digits. Microchip numbers should be 15 digits.`, variant: "destructive" });
    const { pastureId, ...rest } = v;
    rest.microchip = chip || null;
    const price = String(v.salePrice ?? "").replace(/[^0-9.]/g, "");
    rest.salePrice = price ? Number(price) : null;
    for (const k of ["buyerName", "buyerPhone", "buyerEmail", "buyerAddress", "deathCause"]) rest[k] = String(v[k] ?? "").trim() || null;
    delete rest.milkStatusDate; // a changed status is dated today (fine-tune it on the profile)
    rest.tattooLeft = v.tattooLeft?.trim().toUpperCase() || null;
    rest.tattooRight = v.tattooRight?.trim().toUpperCase() || null;
    const saved: any = await save.mutateAsync({ ...rest, name: v.name.trim(), ...(animal ? {} : { pastureId: null }) });
    const newP = pastureId === "none" || pastureId === "" || pastureId == null ? null : Number(pastureId);
    if ((animal?.pastureId ?? null) !== newP) await post("/api/animals/move", { ids: [saved.id], pastureId: newP, date: today() });
    toast({ title: animal ? "Animal updated" : "Animal added", description: v.name });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{animal ? "Edit animal" : "Add animal"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Barn name" className="col-span-2"><Input value={v.barnName ?? ""} onChange={(e) => set("barnName")(e.target.value)} placeholder="What you call her in the barn" data-testid="input-barn-name" /></Field>
          <Field label="Registered name" className="col-span-2"><Input value={v.name ?? ""} onChange={(e) => set("name")(e.target.value)} data-testid="input-name" /></Field>
          <Field label="Herd tag #"><Input value={v.tag ?? ""} onChange={(e) => set("tag")(e.target.value)} data-testid="input-tag" /></Field>
          <Field label="ADGA reg #"><Input value={v.regNumber ?? ""} onChange={(e) => set("regNumber")(e.target.value)} data-testid="input-reg" /></Field>
          <Field label="Sex"><Pick value={v.sex} onChange={set("sex")} testId="select-sex" options={[{ value: "doe", label: "Doe" }, { value: "buck", label: "Buck" }, { value: "wether", label: "Wether" }]} /></Field>
          <Field label="Status"><Pick value={v.status} onChange={setStatus} testId="select-status" options={[{ value: "active", label: "Active" }, { value: "sold", label: "Sold" }, { value: "deceased", label: "Deceased" }]} /></Field>
          {v.status !== "active" && <StatusDetails v={v} set={set} />}
          <Field label="Date of birth"><Input type="date" value={v.dob ?? ""} onChange={(e) => set("dob")(e.target.value)} data-testid="input-dob" /></Field>
          <Field label="Pasture"><Pick value={v.pastureId ? String(v.pastureId) : "none"} onChange={set("pastureId")} testId="select-pasture" options={[...pastures.map((p) => ({ value: String(p.id), label: p.name })), { value: "none", label: "Unassigned" }]} /></Field>
          <Field label="Breed" className="col-span-2" hint={auto ? `Worked out from the parents: ${auto.from}` : isLaMancha(v.breed) ? "Lamanchas are tattooed in the tail web" : undefined}><Input value={v.breed ?? ""} onChange={(e) => setBreed(e.target.value)} data-testid="input-breed" /></Field>
          <Field label="Herdbook"><Pick value={v.herdbook || "none"} onChange={(x) => set("herdbook")(x === "none" ? null : x)} testId="select-herdbook" options={[{ value: "none", label: "Not set" }, ...["Purebred", "American", "Experimental", "Grade"].map((x) => ({ value: x, label: x }))]} /></Field>
          <EarTypeField breed={v.breed} value={v.earType} onChange={set("earType")} />
          <Field label="Group"><Input value={v.groupName ?? ""} onChange={(e) => set("groupName")(e.target.value)} placeholder="Milking string" data-testid="input-group" /></Field>
          <Field label="Color"><Input value={v.color ?? ""} onChange={(e) => set("color")(e.target.value)} data-testid="input-color" /></Field>
          <Field label="Eye color"><Pick value={v.eyeColor ?? "Brown"} onChange={set("eyeColor")} testId="select-eyes" options={EYE_OPTIONS.map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Horn status"><Pick value={v.hornStatus ?? "disbudded"} onChange={set("hornStatus")} testId="select-horns" options={HORN_OPTIONS} /></Field>
          <div className="col-span-2 mt-1 rounded-md border p-3">
            <div className="mb-2 text-sm font-semibold">Tattoo</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Location"><Pick value={v.tattooLocation ?? "ear"} onChange={set("tattooLocation")} testId="select-tattoo-loc" options={[{ value: "ear", label: "Ear" }, { value: "tail", label: "Tail" }]} /></Field>
              <Field label={v.tattooLocation === "tail" ? "Right side" : "Right ear"}><Input value={v.tattooRight ?? ""} onChange={(e) => set("tattooRight")(e.target.value.toUpperCase())} placeholder="GJOY" className="uppercase" data-testid="input-tattoo-right" /></Field>
              <Field label={v.tattooLocation === "tail" ? "Left side" : "Left ear"}><Input value={v.tattooLeft ?? ""} onChange={(e) => set("tattooLeft")(e.target.value.toUpperCase())} placeholder="S3" className="uppercase" data-testid="input-tattoo-left" /></Field>
            </div>
          </div>
          <div className="col-span-2 rounded-md border p-3">
            <div className="mb-2 text-sm font-semibold">Microchip</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Location"><Pick value={v.chipLocation ?? "ear"} onChange={set("chipLocation")} testId="select-chip-loc" options={[{ value: "ear", label: "Base of ear" }, { value: "tail", label: "Tail" }]} /></Field>
              <Field label="Number (15 digits)" className="sm:col-span-2" hint={v.microchip ? `${String(v.microchip).replace(/\D/g, "").length} of 15 digits` : undefined}>
                <Input value={v.microchip ?? ""} inputMode="numeric" maxLength={15} onChange={(e) => set("microchip")(e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="Leave blank if not chipped yet" className="font-mono tabular-nums" data-testid="input-microchip" />
              </Field>
            </div>
          </div>
          <Field label="Sire"><Input list="list-sires" value={v.sire ?? ""} onChange={(e) => set("sire")(e.target.value)} placeholder="Name, barn name or tattoo" data-testid="input-sire" /></Field>
          <Field label="Dam"><Input list="list-dams" value={v.dam ?? ""} onChange={(e) => set("dam")(e.target.value)} placeholder="Name, barn name or tattoo" data-testid="input-dam" /></Field>
          <datalist id="list-sires">{[...herd.filter((a) => a.sex === "buck"), ...(outside as any[])].map((a: any) => <option key={`${a.kind ?? "h"}${a.id}`} value={a.name}>{a.barnName ?? a.farm ?? ""}</option>)}</datalist>
          <datalist id="list-dams">{herd.filter((a) => a.sex === "doe").map((a) => <option key={a.id} value={a.name}>{a.barnName ?? ""}</option>)}</datalist>
          <Field label="Pedigree link" className="col-span-2" hint="Paste the web address of this goat's pedigree (for example, from ADGA Genetics)."><Input type="url" value={v.pedigreeUrl ?? ""} onChange={(e) => set("pedigreeUrl")(e.target.value)} placeholder="https://" data-testid="input-pedigree" /></Field>
          {v.sex === "doe" && (
            <Field label="Milk status" className="col-span-2" hint="Days in milk count from the fresh date while she is In milk, Mastitis or Drying up, and stop when she is Dry.">
              <Pick value={v.milkStatus ?? "none"} onChange={(x) => setV((p: any) => ({ ...p, milkStatus: x === "none" ? null : x, inMilk: ["milking", "mastitis", "drying"].includes(x) }))} testId="select-milk-status"
                options={[{ value: "none", label: "Not fresh yet" }, { value: "milking", label: "In milk" }, { value: "mastitis", label: "Mastitis" }, { value: "drying", label: "Drying up" }, { value: "dry", label: "Dry" }]} />
            </Field>
          )}
          <Field label="Notes" className="col-span-2"><Textarea value={v.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} rows={2} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending} data-testid="button-save-animal">{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Medication ---------------- */
/** Tablet dose worked out from weight (or per head), rounded to the tablet sizes on hand */
export function TabletDoseBox({ dose, hasFirst, isFirst, onFirst, med }: { dose: TabletDose | null; hasFirst: boolean; isFirst: boolean; onFirst: (f: boolean) => void; med?: Medication }) {
  const far = dose && Math.abs(dose.offPct) > 20;
  return (
    <div className="rounded-md border bg-card px-3 py-2" data-testid="box-tablet-dose-result">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Dose</span>
        {hasFirst && (
          <div className="flex overflow-hidden rounded-md border text-xs" role="group" aria-label="First or later dose">
            <button type="button" onClick={() => onFirst(true)} className={`px-2.5 py-1 ${isFirst ? "bg-primary text-primary-foreground" : ""}`} data-testid="button-dose-first">First dose</button>
            <button type="button" onClick={() => onFirst(false)} className={`border-l px-2.5 py-1 ${!isFirst ? "bg-primary text-primary-foreground" : ""}`} data-testid="button-dose-later">Later dose</button>
          </div>
        )}
      </div>
      {dose ? (
        <>
          <div className="mt-1 text-lg font-bold tabular-nums" data-testid="text-tablet-dose">{dose.text}</div>
          <p className="text-xs text-muted-foreground">Works out to {dose.targetMg} mg{med ? ` (${doseRuleText(med)})` : ""}, rounded to the nearest the tablet sizes can make.</p>
          {far && <p className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-200" data-testid="text-tablet-far">That's {Math.abs(dose.offPct)}% {dose.offPct > 0 ? "more" : "less"} than the worked-out dose. Check with your vet{!med?.tabletSplit && med?.pillForm !== "capsule" ? ", or allow splitting tablets on the medicine" : ""}.</p>}
        </>
      ) : <p className="mt-1 text-sm text-muted-foreground">{tabletSizes(med).length ? "Enter the weight to work out the dose." : "Add the tablet sizes on this medicine's card."}</p>}
    </div>
  );
}

const offTag = (d: TabletDose | null) => (d && Math.abs(d.offPct) > 20 ? <b className="text-amber-800 dark:text-amber-200"> ({Math.abs(d.offPct)}% {d.offPct > 0 ? "over" : "under"})</b> : null);

/** Medication values typed in the form, shaped for the tablet math */
const medPreview = (v: any) => ({ doseUnit: v.doseUnit, doseAmount: Number(v.doseAmount) || 0, firstDoseAmount: Number(v.firstDoseAmount) || null, dosePerLbs: Number(v.dosePerLbs) || null, tabletSizes: v.tabletSizes, tabletSplit: !!v.tabletSplit, pillForm: v.pillForm });

export function MedDialog({ open, onOpenChange, med }: { open: boolean; onOpenChange: (o: boolean) => void; med?: Medication }) {
  const save = useSave("medications");
  const { toast } = useToast();
  const [v, set] = useFormState<any>(med ?? { category: "Antibiotic", doseUnit: "mg/lb", route: "SQ", milkWithdrawalDays: 0, meatWithdrawalDays: 0, onHandMl: 0, reorderAtMl: 0, vetConfirmed: false }, open);
  const needsConc = String(v.doseUnit).startsWith("mg");
  const dropsMed = v.doseUnit === "drops";
  const tabMg = v.doseUnit === "tab-mg";
  // "Dose is per" box: shown in kg or lb, stored as lb
  const [perUnit, setPerUnit] = useState<"lb" | "kg">("kg");
  const [perTxt, setPerTxt] = useState("");
  useEffect(() => { if (open) { const per = Number(med?.dosePerLbs) || 0; const kg = perKg(per); setPerUnit(per && !kg ? "lb" : "kg"); setPerTxt(per ? String(kg ?? per) : ""); } }, [open, med?.id]); // eslint-disable-line
  const preview = tabMg ? [20, 50, 100, 150].map((w) => ({ w, f: tabletDose(medPreview(v), Number(v.dosePerLbs) > 0 ? w : null, true), d: tabletDose(medPreview(v), Number(v.dosePerLbs) > 0 ? w : null, false) })) : [];
  const submit = async () => {
    if (!v.name?.trim() || v.doseAmount === undefined || v.doseAmount === "") return toast({ title: "Name and dose are required", variant: "destructive" });
    if (tabMg && !tabletSizes(v).length) return toast({ title: "Enter the tablet sizes", description: "The mg in each tablet or capsule, e.g. 7.5, 15", variant: "destructive" });
    await save.mutateAsync({
      ...v, doseAmount: Number(v.doseAmount), concentration: num(v.concentration), repeatDays: num(v.repeatDays), repeatUnit: v.repeatUnit === "hours" ? "hours" : "days", repeatTimes: num(v.repeatTimes) ?? 0,
      milkWithdrawalDays: num(v.milkWithdrawalDays) ?? 0, meatWithdrawalDays: num(v.meatWithdrawalDays) ?? 0,
      onHandMl: num(v.onHandMl) ?? 0, reorderAtMl: num(v.reorderAtMl) ?? 0,
      dosePerLbs: num(v.dosePerLbs), firstDoseAmount: num(v.firstDoseAmount), tabletSplit: !!v.tabletSplit,
      tabletSizes: tabMg ? tabletSizes(v).slice().reverse().join(", ") : v.tabletSizes ?? null, pillForm: v.pillForm === "capsule" ? "capsule" : "tablet",
    });
    toast({ title: med ? "Medication updated" : "Medication added" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{med ? "Edit medication" : "Add medication"}</DialogTitle>
          <DialogDescription>Enter the dose and withdrawal times your vet prescribed. Many goat uses are extra-label.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Product name" className="col-span-2"><Input value={v.name ?? ""} onChange={(e) => set("name")(e.target.value)} data-testid="input-med-name" /></Field>
          <Field label="Category"><Pick value={v.category} onChange={set("category")} options={["Antibiotic", "Dewormer", "Vaccine", "Supplement", "Anti-inflammatory", "Other"].map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Route"><Pick value={v.route} onChange={set("route")} options={["SQ", "IM", "IV", "Oral", "Topical", "Eye", "Intramammary"].map((x) => ({ value: x, label: x }))} /></Field>
          <Field label={tabMg ? (Number(v.firstDoseAmount) > 0 ? "Later doses (mg)" : "Dose (mg)") : dropsMed ? "Drops per dose" : v.doseUnit === "capsules" ? "Capsules per dose" : v.doseUnit === "tablets" ? "Tablets per dose" : v.doseUnit === "tubes" ? "Tubes per side (1 or 0.5)" : "Dose amount"}><Input type="number" inputMode="decimal" step="any" value={v.doseAmount ?? ""} onChange={(e) => set("doseAmount")(e.target.value)} data-testid="input-dose" /></Field>
          <Field label="Dose basis"><Pick value={v.doseUnit} onChange={set("doseUnit")} testId="select-dose-unit" options={DOSE_UNITS.filter((u) => u.value === v.doseUnit || (["capsules", "tablets", "tab-mg"].includes(u.value) ? v.route === "Oral" : u.value === "tubes" ? v.route === "Intramammary" : true))} /></Field>
          {tabMg && (
            <div className="col-span-2 grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3" data-testid="box-tablet-dose">
              <Field label="Given as"><Pick value={v.pillForm === "capsule" ? "capsule" : "tablet"} onChange={set("pillForm")} testId="select-pill-form" options={[{ value: "tablet", label: "Tablets" }, { value: "capsule", label: "Capsules" }]} /></Field>
              <Field label="Sizes on hand (mg each)" hint="e.g. 7.5, 15"><Input value={v.tabletSizes ?? ""} onChange={(e) => set("tabletSizes")(e.target.value)} placeholder="7.5, 15" data-testid="input-tablet-sizes" /></Field>
              <Field label="Dose is per" hint="Blank = the same dose per head">
                <div className="flex gap-1.5">
                  <Input type="number" inputMode="decimal" step="any" className="min-w-0" value={perTxt} placeholder="e.g. 1"
                    onChange={(e) => { setPerTxt(e.target.value); set("dosePerLbs")(Number(e.target.value) > 0 ? (perUnit === "kg" ? Number(e.target.value) * LB_PER_KG : Number(e.target.value)) : ""); }} data-testid="input-dose-per-lbs" />
                  <select value={perUnit} onChange={(e) => { const u = e.target.value as "lb" | "kg"; setPerUnit(u); if (Number(perTxt) > 0) set("dosePerLbs")(u === "kg" ? Number(perTxt) * LB_PER_KG : Number(perTxt)); }} className="h-9 shrink-0 rounded-md border bg-background px-2 text-sm" aria-label="lb or kg" data-testid="select-dose-per-unit"><option value="kg">kg</option><option value="lb">lb</option></select>
                </div>
              </Field>
              <Field label="First dose (mg)" hint="Only if the first dose is different"><Input type="number" inputMode="decimal" step="any" value={v.firstDoseAmount ?? ""} onChange={(e) => set("firstDoseAmount")(e.target.value)} data-testid="input-first-dose" /></Field>
              {v.pillForm !== "capsule" && (
                <div className="col-span-2 flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <span className="text-sm">Tablets can be split in half</span>
                  <Switch checked={!!v.tabletSplit} onCheckedChange={set("tabletSplit")} data-testid="switch-tablet-split" />
                </div>
              )}
              <p className="col-span-2 text-xs text-muted-foreground">Each dose is worked out{Number(v.dosePerLbs) > 0 ? " from the goat's weight" : ""}, then rounded to the nearest amount the sizes above can make (ties round down).</p>
              {preview.some((p) => p.d) && (
                <ul className="col-span-2 space-y-0.5 text-xs" data-testid="list-tablet-preview">
                  {(Number(v.dosePerLbs) > 0 ? preview : preview.slice(0, 1)).map((p) => (
                    <li key={p.w} className="tabular-nums">{Number(v.dosePerLbs) > 0 ? <b>{p.w} lb: </b> : <b>Each goat: </b>}{Number(v.firstDoseAmount) > 0 ? <>first {p.f?.text ?? "—"}{offTag(p.f)}; later {p.d?.text ?? "—"}{offTag(p.d)}</> : <>{p.d?.text ?? "—"}{offTag(p.d)}</>}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {needsConc && <Field label="Strength (mg per mL)" className="col-span-2"><Input type="number" inputMode="decimal" step="any" value={v.concentration ?? ""} onChange={(e) => set("concentration")(e.target.value)} data-testid="input-concentration" /></Field>}
          <Field label="Milk withdrawal (days)"><Input type="number" inputMode="numeric" value={v.milkWithdrawalDays ?? ""} onChange={(e) => set("milkWithdrawalDays")(e.target.value)} data-testid="input-milk-wd" /></Field>
          <Field label="Meat withdrawal (days)"><Input type="number" inputMode="numeric" value={v.meatWithdrawalDays ?? ""} onChange={(e) => set("meatWithdrawalDays")(e.target.value)} data-testid="input-meat-wd" /></Field>
          <Field label="Usual repeats" hint="Extra doses after the first"><Input type="number" inputMode="numeric" value={v.repeatTimes ?? ""} onChange={(e) => set("repeatTimes")(e.target.value)} data-testid="input-med-repeat-times" /></Field>
          <Field label="Time between doses" hint={v.repeatDays ? repeatText(Number(v.repeatDays), v.repeatUnit) : "e.g., 12 hours = twice a day"}>
            <div className="flex gap-1.5">
              <Input type="number" inputMode="numeric" className="min-w-0" value={v.repeatDays ?? ""} onChange={(e) => set("repeatDays")(e.target.value)} data-testid="input-med-repeat-days" />
              <select value={v.repeatUnit ?? "days"} onChange={(e) => set("repeatUnit")(e.target.value)} className="h-9 shrink-0 rounded-md border bg-background px-2 text-sm" aria-label="Days or hours" data-testid="select-med-repeat-unit"><option value="days">days</option><option value="hours">hours</option></select>
            </div>
          </Field>
          <Field label="On hand (mL)"><Input type="number" inputMode="decimal" value={v.onHandMl ?? ""} onChange={(e) => set("onHandMl")(e.target.value)} data-testid="input-onhand" /></Field>
          <Field label="Reorder when below (mL)"><Input type="number" inputMode="decimal" value={v.reorderAtMl ?? ""} onChange={(e) => set("reorderAtMl")(e.target.value)} /></Field>
          <div className="col-span-2 flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm">Dose and withdrawal confirmed with vet</span>
            <Switch checked={!!v.vetConfirmed} onCheckedChange={set("vetConfirmed")} data-testid="switch-vet" />
          </div>
          <Field label="Notes" className="col-span-2"><Textarea rows={2} value={v.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending} data-testid="button-save-med">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Single treatment ---------------- */
export function TreatDialog({ open, onOpenChange, animal: fixed }: { open: boolean; onOpenChange: (o: boolean) => void; animal?: Animal }) {
  const { data: meds = [] } = useList("medications");
  const { data: treatList = [] } = useList("treatments");
  const { data: weights = [] } = useList("weights");
  const { data: animals = [] } = useList("animals");
  const [saving, setSaving] = useState(false);
  const [pickId, setPickId] = useState<string | null>(null);
  const [newMed, setNewMed] = useState(false);
  const { toast } = useToast();
  useEffect(() => { if (open) setPickId(null); else medsBefore.current = []; }, [open]);
  const animal = fixed ?? animals.find((a) => String(a.id) === pickId);
  const lw = animal ? latestWeight(animal.id, weights) : undefined;
  const [v, set, setV] = useFormState<any>({ date: today(), weightLbs: lw?.lbs ?? "", givenBy: "", reason: "", times: "0", every: "", unit: "days", time: nowTime(), barnOn: false }, open);
  // The weight must be confirmed (or a new one typed) before a weight-based dose is saved
  const [wOk, setWOk] = useState(false);
  const [wTyped, setWTyped] = useState(false);
  useEffect(() => { if (open) { setWOk(false); setWTyped(false); } }, [open, animal?.id]);
  // A newer weight on file (just weighed, or it finished loading) replaces the one shown, unless one was typed in
  useEffect(() => { if (open && animal && !wTyped) { setV((p: any) => ({ ...p, weightLbs: lw?.lbs ?? "" })); setWOk(false); } }, [lw?.id, animal?.id, open]); // eslint-disable-line
  const { hours: barnHours } = useBarnHours();
  const medsBefore = useRef<number[]>([]);
  useEffect(() => {
    // after adding a new medication, select it automatically
    if (!newMed && medsBefore.current.length) {
      const added = meds.find((m) => !medsBefore.current.includes(m.id));
      if (added) { setV((p: any) => ({ ...p, medicationId: String(added.id) })); medsBefore.current = []; }
    }
  }, [newMed, meds]); // eslint-disable-line
  const med = meds.find((m) => String(m.id) === String(v.medicationId));
  const oral = (v.route ?? med?.route) === "Oral";
  const udder = (v.route ?? med?.route) === "Intramammary";
  const sided = hasSide(v.route ?? med?.route);
  const herd = animals.filter((a) => a.status === "active").sort((a, b) => a.name.localeCompare(b.name));
  // The weight has to be checked only when the dose saved is the one worked out from weight (in mL).
  // Tablets/capsules, udder tubes, or a dose typed in by hand don't need it.
  const autoDose = v.doseMl === "" || v.doseMl == null || Number(v.doseMl) === calcDoseMl(med, Number(v.weightLbs));
  const tab = isTabletMg(med);
  // Tablets in mg: first (loading) dose unless this goat had this medicine in the last week
  const hadRecently = !!(med && animal && treatList.some((t) => t.animalId === animal.id && t.medicationId === med.id && t.date < v.date && t.date >= addDays(v.date, -7)));
  const hasFirst = tab && Number(med?.firstDoseAmount) > 0 && med?.firstDoseAmount !== med?.doseAmount;
  const isFirst = hasFirst && (v.firstDose ?? !hadRecently);
  const tdose = tab ? tabletDose(med, v.weightLbs, !!isFirst) : null;
  useEffect(() => { setV((p: any) => (p.firstDose === undefined ? p : { ...p, firstDose: undefined })); }, [v.medicationId, animal?.id]); // eslint-disable-line
  const needW = tab ? isWeightDosed(med) : isWeightDosed(med) && !udder && !(oral && v.doseUnit && v.doseUnit !== "mL") && autoDose;
  useEffect(() => {
    if (med) setV((p: any) => ({ ...p, doseMl: calcDoseMl(med, Number(p.weightLbs)) ?? "", route: med.route }));
  }, [v.medicationId, v.weightLbs]); // eslint-disable-line
  useEffect(() => {
    if (med) setV((p: any) => ({ ...p, doseUnit: pillUnitOf(med) ?? "mL", tubes: med.doseUnit === "tubes" && med.doseAmount === 0.5 ? "0.5" : "1", side: "", times: String(med.repeatTimes ?? (med.repeatDays ? 1 : 0)), every: med.repeatDays ? String(med.repeatDays) : "", unit: med.repeatUnit === "hours" ? "hours" : "days", barnOn: med.repeatUnit === "hours" && ((med.repeatDays ?? 99) <= 2 || med.repeatDays === 12), time: p.time || nowTime() }));
  }, [v.medicationId]); // eslint-disable-line
  const submit = async () => {
    if (!animal) return toast({ title: "Pick a goat", variant: "destructive" });
    if (!med) return toast({ title: "Pick a medication", variant: "destructive" });
    const times = Math.max(0, Math.floor(Number(v.times) || 0));
    const every = Math.floor(Number(v.every) || 0);
    if ((times > 0 || v.ongoing) && every < 1) return toast({ title: "Enter the time between doses", variant: "destructive" });
    if (tab && !tdose) return toast({ title: tabletSizes(med).length ? "Enter the goat's weight" : "Add the tablet sizes to this medicine", description: tabletSizes(med).length ? "The tablet dose is worked out from weight." : "Edit it in the Medicine Cabinet.", variant: "destructive" });
    if (needW && !weightOk(v.weightLbs, lw, wOk)) return toast({ title: "Check the weight first", description: lw ? `Tap Still correct if ${lw.lbs} lb is right, or type today's weight. Or type the dose yourself.` : "Enter the goat's weight to work out the dose, or type the dose yourself.", variant: "destructive" });
    const unit: RepeatUnit = v.unit === "hours" ? "hours" : "days";
    const plan = repeatPlan(v.date, String(v.ongoing ? 1 : times), String(every), unit, v.time, v.barnOn ? barnHours : null).slice(1);
    setSaving(true);
    try {
      const newW = await saveDoseWeights([{ animalId: animal.id, lbs: v.weightLbs, date: v.date }], weights);
      await post("/api/treatments/batch", {
        treatments: [{
          animalId: animal.id, medicationId: med.id, medName: med.name, date: v.date, time: v.time || null, weightLbs: num(v.weightLbs), tempF: num(v.tempF),
          side: sided ? v.side || null : null,
          ...(tdose ? tabletFields(tdose) : udder ? { doseMl: null, pillCount: Number(v.tubes) || 1, pillUnit: "tube" } : isDrops(med) ? { doseMl: null, drops: num(v.doseMl) } : oral && v.doseUnit !== "mL" ? { doseMl: null, pillCount: num(v.doseMl), pillUnit: v.doseUnit } : { doseMl: num(v.doseMl) }),
          route: v.route, reason: v.reason, givenBy: v.givenBy, notes: v.notes,
          milkClearDate: addDays(v.date, med.milkWithdrawalDays ?? 0), meatClearDate: addDays(v.date, med.meatWithdrawalDays ?? 0),
          nextDoseDate: null,
        }],
        repeat: v.ongoing && every > 0 ? { ongoing: true, times: 1, every, unit, at: unit === "hours" ? plan.slice(0, 1) : undefined, reeval: !!v.reeval }
          : times > 0 ? { times, every, unit, at: unit === "hours" ? plan : undefined, reeval: !!v.reeval } : undefined,
      });
      toast({ title: "Treatment logged", description: `${goatName(animal)} · ${med.name}${times ? ` · ${times} repeat${times > 1 ? "s" : ""} scheduled` : ""}${newW ? ` · new weight ${v.weightLbs} lb saved` : ""}` });
      onOpenChange(false);
    } catch (e: any) { toast({ title: "Could not save", description: String(e?.message ?? e), variant: "destructive" }); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Log treatment</DialogTitle><DialogDescription>{fixed ? fixed.name : "Record a treatment for one goat. For several goats at once, use Batch entry."}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {!fixed && (
            <Field label="Goat" className="col-span-2">
              <GoatPick value={pickId} onChange={setPickId} goats={herd} testId="select-treat-goat" />
            </Field>
          )}
          <Field label="Medication" className="col-span-2" hint={meds.length ? undefined : "No medications yet. Add one to get dosing and withdrawal times."}>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1"><MedPick value={v.medicationId ? String(v.medicationId) : null} onChange={set("medicationId")} testId="select-med" meds={meds} /></div>
              <Button type="button" variant="outline" onClick={() => { medsBefore.current = meds.map((m) => m.id).concat(-1); setNewMed(true); }} data-testid="button-treat-new-med"><Plus />New</Button>
            </div>
          </Field>
          <Field label="Date"><Input type="date" value={v.date} onChange={(e) => set("date")(e.target.value)} /></Field>
          <Field label="Time given"><Input type="time" value={v.time ?? ""} onChange={(e) => set("time")(e.target.value)} data-testid="input-treat-time" /></Field>
          {animal && <div className="col-span-2"><WeightCheck lbs={v.weightLbs} onLbs={(x) => { setWTyped(true); set("weightLbs")(x); }} lw={lw} confirmed={wOk} onConfirmed={setWOk} required={needW} testId="treat-weight" canTypeDose={!tab} /></div>}
          {tab ? (
            <div className="col-span-2"><TabletDoseBox dose={tdose} hasFirst={!!hasFirst} isFirst={!!isFirst} onFirst={(f) => set("firstDose")(f)} med={med} /></div>
          ) : udder ? (
            <Field label="Dose"><Pick value={v.tubes ?? "1"} onChange={set("tubes")} testId="select-treat-tubes" options={TUBE_AMOUNTS} /></Field>
          ) : (
          <Field label={isDrops(med) ? "Drops" : oral ? "Dose" : "Dose (mL)"} className={oral && !isDrops(med) ? "col-span-2" : undefined} hint={isDrops(med) ? "Drops per dose. Change it if needed." : oral && v.doseUnit && v.doseUnit !== "mL" ? `How many ${v.doseUnit}s (½ = 0.5)` : pillUnitOf(med) ? `${pillUnitOf(med) === "capsule" ? "Capsules" : "Tablets"} per dose. Change it if needed.` : med ? "Calculated from weight — edit if needed" : undefined}>
            {oral && !isDrops(med) ? (
              <div className="flex gap-2">
                <Input className="min-w-0 flex-1" type="number" inputMode="decimal" step={v.doseUnit === "mL" ? "0.1" : "0.5"} value={v.doseMl ?? ""} onChange={(e) => set("doseMl")(e.target.value)} data-testid="input-treat-dose" />
                <div className="w-28 shrink-0"><Pick value={v.doseUnit ?? "mL"} onChange={set("doseUnit")} testId="select-treat-dose-unit" options={ORAL_UNITS} /></div>
              </div>
            ) : <Input type="number" inputMode="decimal" step={isDrops(med) ? "1" : "0.1"} value={v.doseMl ?? ""} onChange={(e) => set("doseMl")(e.target.value)} data-testid="input-treat-dose" />}
          </Field>
          )}
          {sided && <Field label="Side" hint={udder ? "Which half of the udder" : "Which eye"}><Pick value={v.side || null} onChange={set("side")} testId="select-treat-side" placeholder="Left, right or both" options={SIDES} /></Field>}
          <Field label="Temperature (°F)" hint={<TempHint f={v.tempF} />}><Input type="number" inputMode="decimal" step="0.1" placeholder="e.g., 102.5" value={v.tempF ?? ""} onChange={(e) => set("tempF")(e.target.value)} data-testid="input-treat-temp" /></Field>
          <Field label="Given by" className="col-span-2"><Input value={v.givenBy} onChange={(e) => set("givenBy")(e.target.value)} /></Field>
          <Field label="Reason" className="col-span-2"><Input value={v.reason} onChange={(e) => set("reason")(e.target.value)} placeholder="e.g., FAMACHA 4, pinkeye" /></Field>
          {med && (
            <div className="col-span-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Milk clear {fmtShort(addDays(v.date, med.milkWithdrawalDays ?? 0))} · Meat clear {fmtShort(addDays(v.date, med.meatWithdrawalDays ?? 0))} (after this dose; each repeat restarts the clock)
            </div>
          )}
          {med && <div className="col-span-2"><RepeatFields start={v.date} times={v.times} every={v.every} unit={v.unit === "hours" ? "hours" : "days"} time={v.time || "08:00"} onTimes={set("times")} onEvery={set("every")} onUnit={set("unit")} onTime={set("time")} barnOn={!!v.barnOn} onBarnOn={set("barnOn")} ongoing={!!v.ongoing} onOngoing={set("ongoing")} reeval={!!v.reeval} onReeval={set("reeval")} /></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="button-save-treatment">Save treatment</Button>
        </DialogFooter>
      </DialogContent>
      <MedDialog open={newMed} onOpenChange={setNewMed} />
    </Dialog>
  );
}

/* ---------------- Temperature (optional) ---------------- */
/** Colored note under a temperature entry: normal, fever or low */
export function TempHint({ f }: { f?: string | number | null }) {
  const n = tempNote(f);
  if (!n) return <>Optional · normal 101.5–103.5</>;
  return <span className={n.tone === "ok" ? "text-emerald-700 dark:text-emerald-400" : n.tone === "high" ? "font-semibold text-destructive" : "font-semibold text-sky-700 dark:text-sky-400"}>{n.text === "normal" ? "Normal" : n.text[0].toUpperCase() + n.text.slice(1)}</span>;
}

/* ---------------- Pedigree link ---------------- */
export function PedigreeLink({ url, className }: { url?: string | null; className?: string }) {
  if (!url) return null;
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline ${className ?? ""}`} data-testid="link-pedigree">
      Pedigree <ExternalLink className="h-3 w-3" />
    </a>
  );
}

/* ---------------- Guest / frozen buck ---------------- */
export function OutsideBuckDialog({ open, onOpenChange, buck, kind, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; buck?: OutsideBuck; kind: "guest" | "frozen"; onSaved?: (b: OutsideBuck) => void;
}) {
  const save = useSave("outsideBucks");
  const { toast } = useToast();
  const frozen = (buck?.kind ?? kind) === "frozen";
  const [v, set] = useFormState<any>(buck ?? { kind, name: "", breed: "", active: true, startingStraws: frozen ? "" : 0, strawsOnHand: frozen ? "" : 0 }, open);
  const submit = async () => {
    if (!v.name?.trim()) return toast({ title: "Buck name is required", variant: "destructive" });
    const start = num(v.startingStraws) ?? 0;
    const row = { ...v, kind: buck?.kind ?? kind, name: v.name.trim(), startingStraws: start,
      strawsOnHand: buck ? (num(v.strawsOnHand) ?? 0) : start, pedigreeUrl: v.pedigreeUrl?.trim() || null };
    const saved = await save.mutateAsync(row);
    toast({ title: buck ? "Buck updated" : frozen ? "Added to tank" : "Guest buck added", description: row.name });
    onSaved?.(saved);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{buck ? "Edit buck" : frozen ? "Add frozen buck to tank" : "Add guest buck"}</DialogTitle>
          <DialogDescription>{frozen ? "Frozen semen in your tank. Straws are deducted each time you record an AI breeding." : "A buck from another farm, used for live cover."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Buck name" className="col-span-2"><Input value={v.name} onChange={(e) => set("name")(e.target.value)} placeholder="Registered name" data-testid="input-ob-name" /></Field>
          <Field label="Registration #"><Input value={v.regNumber ?? ""} onChange={(e) => set("regNumber")(e.target.value)} data-testid="input-ob-reg" /></Field>
          <Field label="Breed"><Input value={v.breed ?? ""} onChange={(e) => set("breed")(e.target.value)} /></Field>
          <Field label={frozen ? "Source / owner" : "Farm"} className="col-span-2"><Input value={v.farm ?? ""} onChange={(e) => set("farm")(e.target.value)} placeholder="Farm or herd name" data-testid="input-ob-farm" /></Field>
          <Field label="Pedigree link" className="col-span-2" hint="Paste the web address of his pedigree (for example, from ADGA Genetics).">
            <Input type="url" value={v.pedigreeUrl ?? ""} onChange={(e) => set("pedigreeUrl")(e.target.value)} placeholder="https://" data-testid="input-ob-pedigree" />
          </Field>
          {frozen && <>
            <Field label="Starting straws"><Input type="number" inputMode="numeric" min={0} value={v.startingStraws ?? ""} onChange={(e) => set("startingStraws")(e.target.value)} data-testid="input-ob-start" /></Field>
            {buck ? <Field label="Straws on hand" hint="Adjust only after a physical count."><Input type="number" inputMode="numeric" min={0} value={v.strawsOnHand ?? ""} onChange={(e) => set("strawsOnHand")(e.target.value)} data-testid="input-ob-onhand" /></Field>
              : <Field label="Canister / cane"><Input value={v.canister ?? ""} onChange={(e) => set("canister")(e.target.value)} placeholder="Canister 1" data-testid="input-ob-canister" /></Field>}
            {buck && <Field label="Canister / cane"><Input value={v.canister ?? ""} onChange={(e) => set("canister")(e.target.value)} /></Field>}
            <Field label="Collection date"><Input type="date" value={v.collectionDate ?? ""} onChange={(e) => set("collectionDate")(e.target.value)} /></Field>
          </>}
          <div className="col-span-2 flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="ob-active" className="text-sm">{frozen ? "Available for AI" : "Available for breeding"}</Label>
            <Switch id="ob-active" checked={!!v.active} onCheckedChange={set("active")} />
          </div>
          <Field label="Notes" className="col-span-2"><Textarea rows={2} value={v.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending} data-testid="button-save-ob">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Breeding ---------------- */
export function BreedingDialog({ open, onOpenChange, doeId, breeding, method, preset }: { open: boolean; onOpenChange: (o: boolean) => void; doeId?: number; breeding?: Breeding; method?: string; preset?: { buckSource: string; buckRefId: number; buck: string } }) {
  const { data: animals = [] } = useList("animals");
  const { data: outside = [] } = useList("outsideBucks");
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [addKind, setAddKind] = useState<null | "guest" | "frozen">(null);
  const does = animals.filter((a) => a.sex === "doe" && a.status === "active");
  const herdBucks = animals.filter((a) => a.sex === "buck" && a.status === "active");
  const guests = outside.filter((b) => b.kind === "guest" && (b.active || (breeding?.buckSource === "guest" && breeding.buckRefId === b.id)));
  // tank: available straws, plus the one already on this breeding (its straws come back when editing)
  const tank = outside.filter((b) => b.kind === "frozen" && ((b.active && (b.strawsOnHand ?? 0) > 0) || (breeding?.buckSource === "frozen" && breeding.buckRefId === b.id)));
  const [v, set, setV] = useFormState<any>(breeding ? { ...breeding } : { doeId, date: today(), method: preset?.buckSource === "frozen" ? "AI" : method ?? "Pen", status: "bred", buck: preset?.buck ?? "", buckSource: preset?.buckSource ?? null, buckRefId: preset?.buckRefId ?? null, straws: 1 }, open);
  const ai = v.method === "AI";
  const key = v.buckSource && v.buckRefId ? `${v.buckSource}:${v.buckRefId}` : null;
  const pickBuck = (k: string) => {
    const [src, idStr] = k.split(":"); const id = Number(idStr);
    const name = src === "herd" ? animals.find((a) => a.id === id)?.name : outside.find((b) => b.id === id)?.name;
    setV((p: any) => ({ ...p, buckSource: src, buckRefId: id, buck: name ?? "" }));
  };
  const setMethod = (m: string) => setV((p: any) => {
    const wasAi = p.method === "AI", nowAi = m === "AI";
    return wasAi === nowAi ? { ...p, method: m } : { ...p, method: m, buckSource: null, buckRefId: null, buck: "" };
  });
  const sel = v.buckSource === "herd" ? animals.find((a) => a.id === v.buckRefId) : outside.find((b) => b.id === v.buckRefId);
  const tankBuck = v.buckSource === "frozen" ? outside.find((b) => b.id === v.buckRefId) : undefined;
  const available = tankBuck ? (tankBuck.strawsOnHand ?? 0) + (breeding?.buckSource === "frozen" && breeding.buckRefId === tankBuck.id ? (breeding.straws ?? 0) : 0) : 0;
  const strawsN = Math.max(1, Math.floor(Number(v.straws) || 1));
  const submit = async () => {
    if (!v.doeId || !v.date) return toast({ title: "Doe and date are required", variant: "destructive" });
    if (!v.buckSource || !v.buckRefId) return toast({ title: ai ? "Pick a buck from the tank" : "Pick a buck", variant: "destructive" });
    if (ai && strawsN > available) return toast({ title: "Not enough straws", description: `Only ${available} on hand for ${shortName(v.buck)}.`, variant: "destructive" });
    setSaving(true);
    try {
      const { id, ...rest } = v;
      await post("/api/breedings/save", { ...rest, id: breeding?.id, usResult: v.usResult || null, usDate: v.usResult ? (v.usDate || today()) : v.usDate || null, doeId: Number(v.doeId), dueDate: addDays(v.date, GESTATION_DAYS), kidsBorn: num(v.kidsBorn),
        straws: ai ? strawsN : null, kiddingDate: v.status === "kidded" ? (v.kiddingDate || today()) : v.kiddingDate ?? null, doeInMilk: v.status === "kidded" && freshen });
      toast({ title: breeding ? "Breeding updated" : "Breeding recorded",
        description: ai ? `${strawsN} straw${strawsN > 1 ? "s" : ""} deducted · ${available - strawsN} left of ${shortName(v.buck)}` : `Due ${fmtShort(addDays(v.date, GESTATION_DAYS))}` });
      onOpenChange(false);
    } catch (e: any) { toast({ title: "Could not save", description: String(e.message ?? e), variant: "destructive" }); }
    finally { setSaving(false); }
  };
  const [confirmDel, setConfirmDel] = useState(false);
  const del = async () => {
    if (!breeding) return;
    await apiRequest("DELETE", `/api/breedings/${breeding.id}`); invalidateAll();
    toast({ title: "Breeding deleted", description: breeding.buckSource === "frozen" && breeding.straws ? `${breeding.straws} straw${breeding.straws > 1 ? "s" : ""} returned to the tank` : undefined });
    setConfirmDel(false); onOpenChange(false);
  };
  const kidded = v.status === "kidded";
  const [freshen, setFreshen] = useState(true);
  useEffect(() => { if (open) setFreshen(breeding?.status !== "kidded"); }, [open]); // eslint-disable-line
  // Ultrasound result drives the status: positive → confirmed (due date roster), negative → open
  const setUs = (r: string) => setV((p: any) => ({ ...p, usResult: r === "none" ? null : r, usDate: r === "none" ? null : p.usDate || today(),
    status: p.status === "kidded" ? p.status : r === "positive" ? "confirmed" : r === "negative" ? "open" : "bred" }));
  const usScheduled = v.date ? usDue({ ...(v as any), usResult: v.usResult }) : null;
  const dueNow = v.date ? addDays(v.date, GESTATION_DAYS) : null;
  const legacy = !v.buckSource && v.buck; // older record typed by hand
  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{breeding ? "Update breeding" : "Record breeding"}</DialogTitle><DialogDescription>Due date is set {GESTATION_DAYS} days after breeding.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Doe" className="col-span-2"><GoatPick value={v.doeId} onChange={set("doeId")} goats={does} placeholder="Choose a doe" testId="select-doe" /></Field>
          <Field label="Date bred"><Input type="date" value={v.date} onChange={(e) => set("date")(e.target.value)} data-testid="input-bred-date" /></Field>
          <Field label="Method"><Pick value={v.method} onChange={setMethod} testId="select-method" options={[{ value: "Pen", label: "Live cover (pen)" }, { value: "Hand", label: "Live cover (hand)" }, { value: "AI", label: "AI (frozen straw)" }]} /></Field>
          <Field label={ai ? "Buck from tank" : "Buck"} className="col-span-2"
            hint={legacy ? `Previously entered as "${v.buck}". Pick a buck to link it.` : ai ? (tank.length ? "Only bucks with straws on hand are listed." : "No straws on hand. Add a frozen buck to the tank first.") : "Active herd bucks and guest bucks."}>
            <Select value={key ?? undefined} onValueChange={(k) => k === "__add" ? setAddKind(ai ? "frozen" : "guest") : pickBuck(k)}>
              <SelectTrigger data-testid="select-buck"><SelectValue placeholder={ai ? "Pick a frozen buck" : "Pick a buck"} /></SelectTrigger>
              <SelectContent>
                {ai ? tank.map((b) => <SelectItem key={b.id} value={`frozen:${b.id}`}>{goatName(b)} · {b.strawsOnHand ?? 0} straw{(b.strawsOnHand ?? 0) === 1 ? "" : "s"}</SelectItem>)
                  : <>
                    {herdBucks.length > 0 && <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Herd bucks</div>}
                    {herdBucks.map((a) => <SelectItem key={a.id} value={`herd:${a.id}`}>{goatName(a)}{a.tag ? ` (#${a.tag})` : ""}</SelectItem>)}
                    {guests.length > 0 && <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Guest bucks</div>}
                    {guests.map((b) => <SelectItem key={b.id} value={`guest:${b.id}`}>{goatName(b)}{b.farm ? ` · ${b.farm}` : ""}</SelectItem>)}
                  </>}
                <SelectItem value="__add" data-testid="option-add-buck">{ai ? "+ Add frozen buck to tank" : "+ Add guest buck from another farm"}</SelectItem>
              </SelectContent>
            </Select>
            {sel && <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {(sel as any).regNumber && <span>Reg {(sel as any).regNumber}</span>}
              {(sel as any).farm && <span>{(sel as any).farm}</span>}
              {(sel as any).pedigreeUrl ? <PedigreeLink url={(sel as any).pedigreeUrl} /> : <span>No pedigree link yet</span>}
            </div>}
          </Field>
          {ai && <Field label="Straws used" className="col-span-2" hint={tankBuck ? `${available} on hand · ${Math.max(0, available - strawsN)} left after this breeding` : undefined}>
            <Input type="number" inputMode="numeric" min={1} value={v.straws ?? 1} onChange={(e) => set("straws")(e.target.value)} data-testid="input-straws" />
          </Field>}
          <div className="col-span-2 rounded-lg border bg-muted/30 p-3" data-testid="section-ultrasound">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">Ultrasound</span>
              {usScheduled && <span className="text-xs text-muted-foreground">{v.usResult === "recheck" ? "Recheck" : `Requested ${ULTRASOUND_DAYS} days after breeding`}: <span className="font-semibold text-foreground">{fmtShort(usScheduled)}</span></span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Result"><Pick value={v.usResult ?? "none"} onChange={setUs} testId="select-us-result" options={[{ value: "none", label: "Not done yet" }, { value: "positive", label: US_LABEL.positive }, { value: "negative", label: US_LABEL.negative }, { value: "recheck", label: `Recheck in ${RECHECK_DAYS} days` }]} /></Field>
              <Field label="Date done"><Input type="date" value={v.usDate ?? ""} disabled={!v.usResult} onChange={(e) => set("usDate")(e.target.value)} data-testid="input-us-date" /></Field>
              {v.usResult && <Field label="Ultrasound notes" className="col-span-2"><Input value={v.usNotes ?? ""} onChange={(e) => set("usNotes")(e.target.value)} placeholder="Vet, number of kids seen…" data-testid="input-us-notes" /></Field>}
            </div>
            {v.usResult === "positive" && dueNow && <p className="mt-2 text-xs text-muted-foreground">Added to the due date roster · due {fmtShort(dueNow)}.</p>}
            {v.usResult === "negative" && <p className="mt-2 text-xs text-muted-foreground">Marked open. She goes back on heat watch.</p>}
          </div>
          {v.status === "confirmed" && dueNow && (
            <div className="col-span-2 rounded-lg border bg-muted/30 p-3" data-testid="section-prekid">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">CD&T and BoSe</span>
                <span className="text-xs text-muted-foreground">{PREKID_DAYS} days before due: <span className="font-semibold text-foreground">{fmtShort(addDays(dueNow, -PREKID_DAYS))}</span></span>
              </div>
              <Field label="Given on" hint={v.prekidDate ? undefined : "Use Given on the Today page to log both shots with doses from the Medicine Cabinet."}>
                <Input type="date" value={v.prekidDate ?? ""} onChange={(e) => set("prekidDate")(e.target.value || null)} data-testid="input-prekid-date" />
              </Field>
            </div>
          )}
          <Field label="Status" className="col-span-2"><Pick value={v.status} onChange={set("status")} testId="select-breed-status" options={[{ value: "bred", label: "Bred" }, { value: "confirmed", label: "Confirmed pregnant" }, { value: "kidded", label: "Kidded" }, { value: "open", label: "Open (did not take)" }]} /></Field>
          {kidded && <>
            <Field label="Kidding date"><Input type="date" value={v.kiddingDate ?? today()} onChange={(e) => set("kiddingDate")(e.target.value)} data-testid="input-kid-date" /></Field>
            <Field label="Kids born"><Input type="number" inputMode="numeric" value={v.kidsBorn ?? ""} onChange={(e) => set("kidsBorn")(e.target.value)} data-testid="input-kids" /></Field>
            <label className="col-span-2 flex cursor-pointer items-start gap-3 rounded-md border border-primary/40 bg-accent/40 px-3 py-2.5" data-testid="label-freshen">
              <Checkbox checked={freshen} onCheckedChange={(c) => setFreshen(!!c)} className="mt-0.5" data-testid="check-freshen" />
              <span className="text-sm"><span className="font-semibold">She's in milk</span>
                <span className="block text-xs text-muted-foreground">Starts her lactation on the kidding date, so days in milk count from {fmtShort(v.kiddingDate || today())}. Change it later to Mastitis, Drying up or Dry on her profile.</span></span>
            </label>
          </>}
          <Field label="Notes" className="col-span-2"><Textarea rows={2} value={v.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} /></Field>
        </div>
        <DialogFooter className="gap-2">
          {breeding && <Button variant="ghost" className="text-destructive sm:mr-auto" onClick={() => setConfirmDel(true)} data-testid="button-delete-breeding">Delete</Button>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="button-save-breeding">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete this breeding?</AlertDialogTitle>
          <AlertDialogDescription>{breeding?.buckSource === "frozen" ? "The straws used will be added back to the tank." : "This removes the breeding record."}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={del} data-testid="button-confirm-delete-breeding">Delete</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <OutsideBuckDialog open={!!addKind} kind={addKind ?? "guest"} onOpenChange={(o) => !o && setAddKind(null)}
      onSaved={(b) => setV((p: any) => ({ ...p, buckSource: b.kind, buckRefId: b.id, buck: b.name }))} />
    </>
  );
}


/** Log (or edit) an observed heat. Predicted next heat updates from the doe's own cycle history. */
export function HeatDialog({ open, onOpenChange, heat, doeId }: { open: boolean; onOpenChange: (o: boolean) => void; heat?: Heat; doeId?: number }) {
  const save = useSave("heats");
  const del = useRemove("heats");
  const { toast } = useToast();
  const { data: animals = [] } = useList("animals");
  const { data: heats = [] } = useList("heats");
  const { data: breedings = [] } = useList("breedings");
  const [confirmDel, setConfirmDel] = useState(false);
  const [v, set] = useFormState<any>(heat ?? { doeId: doeId ?? null, date: today(), strength: "normal", signs: "", notes: "" }, open);
  const does = animals.filter((a) => a.sex === "doe" && (a.status === "active" || a.id === v.doeId)).sort((a, b) => goatName(a).localeCompare(goatName(b)));
  const signs = new Set(String(v.signs || "").split(",").map((x: string) => x.trim()).filter(Boolean));
  const toggleSign = (sg: string) => { const n = new Set(signs); n.has(sg) ? n.delete(sg) : n.add(sg); set("signs")(Array.from(n).join(",")); };
  // Preview: what the next heat will be after this entry
  const preview = (() => {
    if (!v.doeId || !v.date) return null;
    const others = heats.filter((h) => h.id !== heat?.id);
    const dates = heatDates(Number(v.doeId), [...others, { id: -1, doeId: Number(v.doeId), date: v.date, strength: v.strength, signs: v.signs, notes: null }], breedings).map((d) => d.date);
    const { interval, personal, cycles } = heatInterval(dates);
    const last = dates[dates.length - 1];
    return { next: addDays(last, interval), interval, personal, cycles };
  })();
  const submit = async () => {
    if (!v.doeId) return toast({ title: "Choose a doe", variant: "destructive" });
    if (!v.date) return toast({ title: "Date is required", variant: "destructive" });
    await save.mutateAsync({ ...v, doeId: Number(v.doeId), notes: v.notes?.trim() || null, signs: v.signs || null });
    const doe = animals.find((a) => a.id === Number(v.doeId));
    toast({ title: heat ? "Heat updated" : "Heat logged", description: preview ? `${doe ? goatName(doe) : "Doe"}: next heat about ${fmtShort(preview.next)}` : undefined });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{heat ? "Edit heat" : "Log heat"}</DialogTitle>
          <DialogDescription>Enter the day you saw her in heat. Her next heat date adjusts to her own cycle.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Doe" className="col-span-2">
            <GoatPick value={v.doeId} onChange={(x) => set("doeId")(Number(x))} goats={does} placeholder="Choose a doe" testId="select-heat-doe" />
          </Field>
          <Field label="Date heat observed"><Input type="date" value={v.date} max={today()} onChange={(e) => set("date")(e.target.value)} data-testid="input-heat-date" /></Field>
          <Field label="Strength">
            <Pick value={v.strength ?? "normal"} onChange={set("strength")} options={[{ value: "weak", label: "Weak / quiet" }, { value: "normal", label: "Normal" }, { value: "strong", label: "Strong / standing" }]} testId="select-heat-strength" />
          </Field>
          <Field label="Signs seen" className="col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {HEAT_SIGNS.map((sg) => (
                <button key={sg} type="button" onClick={() => toggleSign(sg)} data-testid={`chip-sign-${sg}`}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium hover-elevate ${signs.has(sg) ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>{sg}</button>
              ))}
            </div>
          </Field>
          <Field label="Notes" className="col-span-2"><Textarea rows={2} value={v.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} placeholder="Time of day, how long it lasted…" /></Field>
          {preview && (
            <div className="col-span-2 rounded-md bg-secondary/60 px-3 py-2 text-xs" data-testid="text-heat-preview">
              Next heat expected about <span className="font-semibold">{fmtDate(preview.next)}</span> (watch {fmtShort(addDays(preview.next, -2))}–{fmtShort(addDays(preview.next, 2))}).
              <div className="mt-0.5 text-muted-foreground">{preview.personal ? `Based on her average ${preview.interval}-day cycle (${preview.cycles} cycle${preview.cycles === 1 ? "" : "s"} on record).` : `Using the typical ${preview.interval}-day cycle until she has two heats on record.`}</div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {heat ? <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDel(true)} data-testid="button-delete-heat">Delete</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending} data-testid="button-save-heat">{heat ? "Save" : "Log heat"}</Button>
          </div>
        </DialogFooter>
        <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Delete this heat?</AlertDialogTitle><AlertDialogDescription>The heat watch will recalculate from her other records.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={async () => { await del.mutateAsync(heat!.id); setConfirmDel(false); onOpenChange(false); toast({ title: "Heat deleted" }); }}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
