import { useFarmName } from "@/lib/farm";
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { useApp } from "@/components/shell";
import { parseAsk } from "@/lib/ask";
import { useLocation } from "wouter";
import { Search, X, Download, Printer, ChevronDown, FileSpreadsheet, FileText, Files, Sheet, ExternalLink, ArrowUp, ArrowDown, ArrowUpDown, FileSearch, ChevronRight, Columns3, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Empty } from "@/components/shell";
import { Pick } from "@/components/forms";
import {
  useList, age, fmtShort, HORN_LABEL, shortName, normName, latestWeight, progenyOf, activeHolds, addDays, daysBetween, GESTATION_DAYS, API_BASE, breedKey, colorWords, breedOptions, colorOptions, usDue, US_LABEL, daysInMilk, MILK_STATUS,
  type Animal, fmtTime, goatName, regName } from "@/lib/herd";
import { cn } from "@/lib/utils";

type Kind = "text" | "date" | "num";
type Col = { key: string; label: string; kind: Kind; get: (r: Row) => string | number | null | undefined; fmt?: (r: Row) => React.ReactNode; wide?: boolean };
type Row = { id: string; animal?: Animal; date?: string | null; v: Record<string, string | number | null | undefined> };

const REPORTS = [
  { value: "herd", label: "Herd roster", dated: false },
  { value: "treatments", label: "Treatments", dated: true },
  { value: "weights", label: "Weights", dated: true },
  { value: "breedings", label: "Breeding & kidding", dated: true },
  { value: "milk", label: "Milk tests", dated: true },
  { value: "moves", label: "Pasture moves", dated: true },
  { value: "heats", label: "Heats", dated: true },
  { value: "shows", label: "Shows", dated: true },
  { value: "care", label: "Care jobs", dated: true },
  { value: "notes", label: "Animal notes", dated: true },
] as const;
type ReportKey = (typeof REPORTS)[number]["value"];

// Columns left off by default so a fresh report fits the page; tick them back on in Columns
const DEFAULT_HIDE: Record<string, string[]> = {
  herd: ["tatR", "tatL", "tatLoc", "chip", "chipLoc", "horns", "eyes", "progeny", "hold", "notes", "lbs", "status", "milking", "dim", "dimTotal", "lacts", "group"],
  treatments: ["dob", "breed", "color", "pasture", "wt", "notes"],
  weights: ["dob", "breed", "color"],
  breedings: ["dob", "breed", "color", "pasture", "source", "straws", "usdue", "notes"],
  milk: ["dob", "breed", "color"],
  moves: ["dob"],
  heats: ["dob", "breed", "color", "pasture"],
  shows: ["dob", "pasture", "color"],
  notes: ["dob", "breed", "color", "pasture"],
  care: ["dob", "breed", "color", "pasture"],
};
const COLS_KEY = ["/api/settings/reportColumns"];
const pDate = (iso?: string | number | null) => { if (!iso) return ""; const [y, m, d] = String(iso).split("-"); return `${Number(m)}/${Number(d)}/${y.slice(2)}`; };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const hayCache = new WeakMap<object, string>();
const cmp = (a: unknown, b: unknown, kind: Kind) => {
  const empty = (x: unknown) => x === null || x === undefined || x === "";
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1; // blanks always last
  if (empty(b)) return -1;
  if (kind === "num") return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
};

const SEX_LABEL: Record<string, string> = { doe: "does", buck: "bucks", wether: "wethers" };

export default function Reports() {
  const farmName = useFarmName();
  const [, nav] = useLocation();
  const { data: animals, isLoading } = useList("animals");
  const { data: pastures = [] } = useList("pastures");
  const { data: weights = [] } = useList("weights");
  const { data: treatments = [] } = useList("treatments");
  const { data: breedings = [] } = useList("breedings");
  const { data: milk = [] } = useList("milk");
  const { data: moves = [] } = useList("pastureMoves");
  const { data: heats = [] } = useList("heats");
  const { data: shows = [] } = useList("shows");
  const { data: aNotes = [] } = useList("animalNotes");
  const { data: careRecs = [] } = useList("care");
  const { data: lactations = [] } = useList("lactations");

  const [report, setReport] = useState<ReportKey>("herd");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [byPasture, setByPasture] = useState(false);
  const [pasture, setPasture] = useState("all");
  const [status, setStatus] = useState("active");
  const [breed, setBreed] = useState("all");
  const [color, setColor] = useState("all");
  const [sex, setSex] = useState("all");
  const [bornFrom, setBornFrom] = useState("");
  const [bornTo, setBornTo] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { reportAsk, setReportAsk } = useApp();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bigPrint, setBigPrint] = useState(false);
  useEffect(() => setPicked(new Set()), [report]);
  const colsQ = useQuery<{ value: any }>({ queryKey: COLS_KEY, staleTime: Infinity });
  const saveCols = useMutation({
    mutationFn: async (value: Record<string, string[]>) => (await apiRequest("PUT", COLS_KEY[0], { value })).json(),
    onMutate: (value) => queryClient.setQueryData(COLS_KEY, { value }),
  });
  const hiddenFor = (rep: string) => new Set<string>((colsQ.data?.value ?? {})[rep] ?? DEFAULT_HIDE[rep] ?? []);
  const setHidden = (rep: string, keys: string[]) => saveCols.mutate({ ...(colsQ.data?.value ?? {}), [rep]: keys });
  // A question like "treatments 9/1 to 9/15" (from the top search bar or this page's search) sets report, dates and search
  const applyAsk = (a: { report: string; from: string; to: string; q: string }) => {
    if (REPORTS.some((x) => x.value === a.report)) setReport(a.report as ReportKey);
    setFrom(a.from); setTo(a.to); setQ(a.q); setStatus("all"); setSex("all"); setBornFrom(""); setBornTo(""); setSort({ key: "date", dir: 1 }); setAsked(true);
  };
  const [asked, setAsked] = useState(false);
  useEffect(() => { if (reportAsk) { applyAsk(reportAsk); setReportAsk(null); } }, [reportAsk]); // eslint-disable-line
  const typedAsk = useMemo(() => parseAsk(q), [q]);
  const PAGE = 100;
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [report, q, pasture, status, sex, bornFrom, bornTo, breed, color, from, to, byPasture, sort.key, sort.dir]);

  const all = animals ?? [];
  const pName = (id?: number | null) => (id ? pastures.find((p) => p.id === id)?.name : undefined) ?? "";
  const aById = useMemo(() => new Map(all.map((a) => [a.id, a])), [all]);
  const datedOf = (r: ReportKey) => REPORTS.find((x) => x.value === r)!.dated;
  const dated = datedOf(report);

  // Columns every report shares, so any report can be sorted by name, birth date and pasture
  const animalCols: Col[] = [
    { key: "name", label: "Goat", kind: "text", get: (r) => r.v.name, fmt: (r) => <span className="font-semibold">{r.v.name}</span> },
    { key: "tag", label: "Tag", kind: "text", get: (r) => r.v.tag },
    { key: "dob", label: "Born", kind: "date", get: (r) => r.v.dob, fmt: (r) => (r.v.dob ? fmtShort(String(r.v.dob)) : "—") },
    { key: "pasture", label: "Pasture", kind: "text", get: (r) => r.v.pasture },
    { key: "breed", label: "Breed", kind: "text", get: (r) => r.v.breed },
    { key: "color", label: "Color", kind: "text", get: (r) => r.v.color },
  ];
  const base = (a?: Animal) => ({
    name: a ? goatName(a) : "Unknown", sortName: a ? normName(goatName(a)) : "", tag: a?.tag ?? "", dob: a?.dob ?? "",
    pasture: pName(a?.pastureId) || "Unassigned", breed: a?.breed ?? "", color: a?.color ?? "", status: a?.status ?? "", group: a?.groupName ?? "",
  });
  const dateCol = (label = "Date"): Col => ({ key: "date", label, kind: "date", get: (r) => r.date, fmt: (r) => (r.date ? fmtShort(r.date) : "—") });

  const build = (report: ReportKey): { cols: Col[]; rows: Row[] } => {
    const holds = activeHolds(treatments, animals ?? []);
    switch (report) {
      case "herd":
        return {
          cols: [
            ...animalCols.slice(0, 3),
            { key: "age", label: "Age", kind: "num", get: (r) => r.v.ageDays, fmt: (r) => age(String(r.v.dob || "")) },
            animalCols[3],
            animalCols[4],
            { key: "barn", label: "Registered name", kind: "text", get: (r) => r.v.barn },
            { key: "sex", label: "Sex", kind: "text", get: (r) => r.v.sex, fmt: (r) => <span className="capitalize">{r.v.sex}</span> },
            { key: "status", label: "Status", kind: "text", get: (r) => r.v.status, fmt: (r) => <span className="capitalize">{r.v.status}</span> },
            { key: "group", label: "Group", kind: "text", get: (r) => r.v.group },
            { key: "reg", label: "Reg #", kind: "text", get: (r) => r.v.reg },
            { key: "herdbook", label: "Herdbook", kind: "text", get: (r) => r.v.herdbook },
            { key: "ears", label: "Ear type", kind: "text", get: (r) => r.v.ears },
            { key: "tatR", label: "Tattoo R", kind: "text", get: (r) => r.v.tatR },
            { key: "tatL", label: "Tattoo L", kind: "text", get: (r) => r.v.tatL },
            { key: "tatLoc", label: "Tattoo loc.", kind: "text", get: (r) => r.v.tatLoc },
            { key: "chip", label: "Microchip", kind: "text", get: (r) => r.v.chip },
            { key: "chipLoc", label: "Chip loc.", kind: "text", get: (r) => r.v.chipLoc },
            { key: "horns", label: "Horns", kind: "text", get: (r) => r.v.horns },
            { key: "color", label: "Color", kind: "text", get: (r) => r.v.color },
            { key: "eyes", label: "Eye color", kind: "text", get: (r) => r.v.eyes },
            { key: "sire", label: "Sire", kind: "text", get: (r) => r.v.sire },
            { key: "dam", label: "Dam", kind: "text", get: (r) => r.v.dam },
            { key: "milking", label: "Milk status", kind: "text", get: (r) => r.v.milking },
            { key: "dim", label: "Days in milk", kind: "num", get: (r) => r.v.dim },
            { key: "dimTotal", label: "Lifetime DIM", kind: "num", get: (r) => r.v.dimTotal },
            { key: "lacts", label: "Lactations", kind: "num", get: (r) => r.v.lacts },
            { key: "lbs", label: "Weight (lb)", kind: "num", get: (r) => r.v.lbs },
            { key: "progeny", label: "Progeny", kind: "num", get: (r) => r.v.progeny },
            { key: "hold", label: "Milk hold until", kind: "date", get: (r) => r.v.hold, fmt: (r) => (r.v.hold ? fmtShort(String(r.v.hold)) : "") },
            { key: "notes", label: "Notes", kind: "text", get: (r) => r.v.notes, wide: true },
          ],
          rows: all.map((a) => ({
            id: `a${a.id}`, animal: a,
            v: {
              ...base(a), ageDays: a.dob ? -new Date(a.dob).getTime() : null, barn: regName(a) || (a.barnName ? "" : shortName(a.name)), sex: a.sex, reg: a.regNumber ?? "", herdbook: a.herdbook ?? "", ears: a.earType ?? "", tatR: a.tattooRight ?? "", tatL: a.tattooLeft ?? "", tatLoc: a.tattooRight || a.tattooLeft ? (a.tattooLocation === "tail" ? "Tail" : "Ear") : "",
              chip: a.microchip ?? "", chipLoc: a.microchip ? (a.chipLocation === "tail" ? "Tail" : "Base of ear") : "", horns: HORN_LABEL[a.hornStatus ?? ""] ?? "", color: a.color ?? "", eyes: a.eyeColor ?? "", sire: a.sire ? shortName(a.sire) : "",
              dam: a.dam ? shortName(a.dam) : "", milking: a.milkStatus ? (MILK_STATUS as any)[a.milkStatus] ?? "" : "", ...(() => { const d = daysInMilk(a.id, lactations); return { dim: d.current, dimTotal: d.total || null, lacts: d.count || null }; })(), lbs: latestWeight(a.id, weights)?.lbs ?? null,
              progeny: progenyOf(a, all).length || null, hold: holds.milk.get(a.id)?.milkClearDate ?? "", notes: a.notes ?? "",
            },
          })),
        };
      case "treatments":
        return {
          cols: [dateCol(), ...animalCols,
            { key: "time", label: "Time", kind: "text", get: (r) => r.v.time },
            { key: "med", label: "Medication", kind: "text", get: (r) => r.v.med, wide: true },
            { key: "dose", label: "Dose (mL)", kind: "num", get: (r) => r.v.dose },
            { key: "drops", label: "Drops", kind: "num", get: (r) => r.v.drops },
            { key: "pills", label: "Capsules / tablets / tubes", kind: "text", get: (r) => r.v.pills },
            { key: "side", label: "Side", kind: "text", get: (r) => r.v.side },
            { key: "doseNo", label: "Dose #", kind: "text", get: (r) => r.v.doseNo },
            { key: "wt", label: "Wt (lb)", kind: "num", get: (r) => r.v.wt },
            { key: "temp", label: "Temp (°F)", kind: "num", get: (r) => r.v.temp },
            { key: "route", label: "Route", kind: "text", get: (r) => r.v.route },
            { key: "reason", label: "Reason", kind: "text", get: (r) => r.v.reason, wide: true },
            { key: "milkClear", label: "Milk clear", kind: "date", get: (r) => r.v.milkClear, fmt: (r) => (r.v.milkClear ? fmtShort(String(r.v.milkClear)) : "") },
            { key: "meatClear", label: "Meat clear", kind: "date", get: (r) => r.v.meatClear, fmt: (r) => (r.v.meatClear ? fmtShort(String(r.v.meatClear)) : "") },
            { key: "givenBy", label: "Given by", kind: "text", get: (r) => r.v.givenBy },
            { key: "notes", label: "Notes", kind: "text", get: (r) => r.v.notes, wide: true },
          ],
          rows: treatments.map((t) => {
            const a = aById.get(t.animalId);
            return { id: `t${t.id}`, animal: a, date: t.date, v: { ...base(a), time: t.time ? fmtTime(t.time) : "", med: t.medName, dose: t.doseMl, drops: t.drops ?? null, pills: t.pillCount && t.pillUnit ? (t.pillUnit === "tube" ? `${t.pillCount === 0.5 ? "½" : t.pillCount} tube per side` : `${t.pillCount} ${t.pillUnit}${t.pillCount === 1 ? "" : "s"}`) : "", side: t.side ?? "", doseNo: t.doseTotal && t.doseTotal > 1 ? `${t.doseNo ?? 1} of ${t.doseTotal}` : "", wt: t.weightLbs, temp: t.tempF, route: t.route ?? "", reason: t.reason ?? "", milkClear: t.milkClearDate ?? "", meatClear: t.meatClearDate ?? "", givenBy: t.givenBy ?? "", notes: t.notes ?? "" } };
          }),
        };
      case "weights":
        return {
          cols: [dateCol(), ...animalCols,
            { key: "lbs", label: "Weight (lb)", kind: "num", get: (r) => r.v.lbs },
            { key: "method", label: "Method", kind: "text", get: (r) => r.v.method, fmt: (r) => <span className="capitalize">{r.v.method}</span> },
          ],
          rows: weights.map((w) => { const a = aById.get(w.animalId); return { id: `w${w.id}`, animal: a, date: w.date, v: { ...base(a), lbs: w.lbs, method: w.method ?? "" } }; }),
        };
      case "breedings":
        return {
          cols: [dateCol("Bred"), { ...animalCols[0], label: "Doe" }, ...animalCols.slice(1),
            { key: "buck", label: "Buck", kind: "text", get: (r) => r.v.buck, wide: true },
            { key: "source", label: "Buck from", kind: "text", get: (r) => r.v.source },
            { key: "method", label: "Method", kind: "text", get: (r) => r.v.method },
            { key: "straws", label: "Straws", kind: "num", get: (r) => r.v.straws },
            { key: "due", label: "Due", kind: "date", get: (r) => r.v.due, fmt: (r) => (r.v.due ? fmtShort(String(r.v.due)) : "") },
            { key: "usdue", label: "Ultrasound due", kind: "date", get: (r) => r.v.usdue, fmt: (r) => (r.v.usdue ? fmtShort(String(r.v.usdue)) : "") },
            { key: "usdate", label: "Ultrasound done", kind: "date", get: (r) => r.v.usdate, fmt: (r) => (r.v.usdate ? fmtShort(String(r.v.usdate)) : "") },
            { key: "usresult", label: "Ultrasound result", kind: "text", get: (r) => r.v.usresult },
            { key: "bstatus", label: "Status", kind: "text", get: (r) => r.v.bstatus, fmt: (r) => <span className="capitalize">{r.v.bstatus}</span> },
            { key: "pkdue", label: "CD&T/BoSe due", kind: "date", get: (r) => r.v.pkdue, fmt: (r) => (r.v.pkdue ? fmtShort(String(r.v.pkdue)) : "") },
            { key: "pkgiven", label: "CD&T/BoSe given", kind: "date", get: (r) => r.v.pkgiven, fmt: (r) => (r.v.pkgiven ? fmtShort(String(r.v.pkgiven)) : "") },
            { key: "kidded", label: "Kidded", kind: "date", get: (r) => r.v.kidded, fmt: (r) => (r.v.kidded ? fmtShort(String(r.v.kidded)) : "") },
            { key: "kids", label: "Kids", kind: "num", get: (r) => r.v.kids },
            { key: "notes", label: "Notes", kind: "text", get: (r) => r.v.notes, wide: true },
          ],
          rows: breedings.map((b) => {
            const a = aById.get(b.doeId);
            return { id: `b${b.id}`, animal: a, date: b.date, v: { ...base(a), buck: shortName(b.buck), source: b.buckSource === "frozen" ? "Tank (AI)" : b.buckSource === "guest" ? "Guest buck" : "Herd", method: b.method ?? "", straws: b.straws, due: b.dueDate ?? addDays(b.date, GESTATION_DAYS), usdue: b.status === "bred" ? usDue(b) : "", usdate: b.usDate ?? "", usresult: b.usResult ? US_LABEL[b.usResult] ?? b.usResult : "", usnotes: b.usNotes ?? "",
              pkdue: b.dueDate && (b.status === "confirmed" || b.prekidDate) ? addDays(b.dueDate, -30) : "", pkgiven: b.prekidDate ?? "", bstatus: b.status, kidded: b.kiddingDate ?? "", kids: b.kidsBorn, notes: b.notes ?? "" } };
          }),
        };
      case "milk":
        return {
          cols: [dateCol("Test day"), ...animalCols,
            { key: "out1", label: "Out 1 (lb)", kind: "num", get: (r) => r.v.out1 },
            { key: "out2", label: "Out 2 (lb)", kind: "num", get: (r) => r.v.out2 },
            { key: "out3", label: "Out 3 (lb)", kind: "num", get: (r) => r.v.out3 },
            { key: "lbs", label: "Test-day total (lb)", kind: "num", get: (r) => r.v.lbs, fmt: (r) => <span className="font-semibold">{Number(r.v.lbs).toFixed(1)}</span> },
            { key: "dim", label: "DIM on test day", kind: "num", get: (r) => r.v.dim },
          ],
          rows: milk.map((m) => { const a = aById.get(m.animalId); return { id: `m${m.id}`, animal: a, date: m.date, v: { ...base(a), out1: m.out1, out2: m.out2, out3: m.out3, lbs: m.lbs,
            dim: (() => { const l = lactations.find((x) => x.animalId === m.animalId && x.startDate <= m.date && (!x.endDate || x.endDate >= m.date)); return l ? daysBetween(l.startDate, m.date) + 1 : null; })() } }; }),
        };
      case "moves":
        return {
          cols: [dateCol("Moved"), ...animalCols.slice(0, 3), { ...animalCols[3], label: "Now in" },
            { key: "from", label: "From", kind: "text", get: (r) => r.v.from },
            { key: "to", label: "To", kind: "text", get: (r) => r.v.to },
          ],
          rows: moves.map((m) => { const a = aById.get(m.animalId); return { id: `p${m.id}`, animal: a, date: m.date, v: { ...base(a), from: pName(m.fromPastureId) || "Unassigned", to: pName(m.toPastureId) || "Unassigned" } }; }),
        };
      case "heats":
        return {
          cols: [dateCol("Heat seen"), { ...animalCols[0], label: "Doe" }, ...animalCols.slice(1),
            { key: "strength", label: "Strength", kind: "text", get: (r) => r.v.strength, fmt: (r) => <span className="capitalize">{r.v.strength}</span> },
            { key: "signs", label: "Signs", kind: "text", get: (r) => r.v.signs, wide: true },
            { key: "gap", label: "Days since last", kind: "num", get: (r) => r.v.gap },
            { key: "notes", label: "Notes", kind: "text", get: (r) => r.v.notes, wide: true },
          ],
          rows: heats.map((h) => {
            const a = aById.get(h.doeId);
            const prev = heats.filter((x) => x.doeId === h.doeId && x.date < h.date).sort((x, y) => y.date.localeCompare(x.date))[0];
            return { id: `h${h.id}`, animal: a, date: h.date, v: { ...base(a), strength: h.strength ?? "", signs: (h.signs ?? "").split(",").filter(Boolean).join(", "), gap: prev ? daysBetween(prev.date, h.date) : null, notes: h.notes ?? "" } };
          }),
        };
      case "shows":
        return {
          cols: [dateCol("Show date"), ...animalCols,
            { key: "show", label: "Show", kind: "text", get: (r) => r.v.show, wide: true },
            { key: "cls", label: "Group / class", kind: "text", get: (r) => r.v.cls, wide: true },
            { key: "placing", label: "Placing", kind: "text", get: (r) => r.v.placing },
            { key: "notes", label: "Note", kind: "text", get: (r) => r.v.notes, wide: true },
          ],
          rows: shows.map((x) => { const a = aById.get(x.animalId); return { id: `s${x.id}`, animal: a, date: x.date, v: { ...base(a), show: x.showName, cls: x.className ?? "", placing: x.placing ?? "", notes: x.notes ?? "" } }; }),
        };
      case "care":
        return {
          cols: [dateCol(), ...animalCols,
            { key: "job", label: "Job", kind: "text", get: (r) => r.v.job },
            { key: "score", label: "Score / result", kind: "text", get: (r) => r.v.score },
            { key: "notes", label: "Note", kind: "text", get: (r) => r.v.notes, wide: true },
            { key: "by", label: "Done by", kind: "text", get: (r) => r.v.by },
          ],
          rows: careRecs.map((x) => { const a = aById.get(x.animalId); return { id: `c${x.id}`, animal: a, date: x.date, v: { ...base(a), job: x.kind, score: x.score ?? "", notes: x.notes ?? "", by: x.doneBy ?? "" } }; }),
        };
      case "notes":
        return {
          cols: [dateCol(), ...animalCols,
            { key: "note", label: "Note", kind: "text", get: (r) => r.v.note, wide: true },
            { key: "by", label: "Entered by", kind: "text", get: (r) => r.v.by },
          ],
          rows: aNotes.map((x) => { const a = aById.get(x.animalId); return { id: `n${x.id}`, animal: a, date: x.date, v: { ...base(a), note: x.note, by: x.enteredBy ?? "" } }; }),
        };
    }
  };
  const { cols, rows } = useMemo(() => build(report), [report, animals, pastures, weights, treatments, breedings, milk, moves, heats, shows, aNotes, lactations, careRecs]); // eslint-disable-line
  const hidden = hiddenFor(report);
  const vcols = cols.filter((c) => c.key === "name" || !hidden.has(c.key));
  const toggleCol = (key: string) => { const h = new Set(hidden); h.has(key) ? h.delete(key) : h.add(key); setHidden(report, Array.from(h)); };

  // Filter → search → sort (shared by the screen and every export)
  const dq = useDeferredValue(q);
  const terms = dq.toLowerCase().split(/\s+/).filter(Boolean);
  const apply = (cols: Col[], rows: Row[], dated: boolean, useSearch = true) => {
    const out = rows
      .filter((r) => status === "all" || !r.animal || r.animal.status === status)
      .filter((r) => pasture === "all" || String(r.animal?.pastureId ?? "none") === pasture)
      .filter((r) => sex === "all" || r.animal?.sex === sex)
      .filter((r) => (!bornFrom && !bornTo) || (!!r.animal?.dob && (!bornFrom || r.animal.dob >= bornFrom) && (!bornTo || r.animal.dob <= bornTo)))
      .filter((r) => breed === "all" || breedKey(r.animal?.breed) === breed)
      .filter((r) => color === "all" || colorWords(r.animal?.color).includes(color))
      .filter((r) => !dated || ((!from || (r.date ?? "") >= from) && (!to || (r.date ?? "") <= to)))
      .filter((r) => {
        if (!useSearch || !terms.length) return true;
        let hay = hayCache.get(r);
        if (hay === undefined) { hay = [r.date ? `${r.date} ${fmtShort(r.date)}` : "", ...cols.map((c) => { const x = c.get(r); return c.kind === "date" && x ? `${x} ${fmtShort(String(x))}` : x; }), r.animal?.name, r.animal?.barnName, r.animal?.color, r.animal?.breed, breedKey(r.animal?.breed), r.animal?.tattooLeft, r.animal?.tattooRight, r.animal?.microchip, r.v.group]
          .filter((x) => x !== null && x !== undefined && x !== "").join(" ").toLowerCase(); hayCache.set(r, hay); }
        return terms.every((t) => hay.includes(t));
      });
    const sc = cols.find((c) => c.key === sort.key) ?? cols.find((c) => c.key === "name")!;
    const dir = cols.some((c) => c.key === sort.key) ? sort.dir : 1;
    const val = (r: Row) => (sc.key === "name" ? r.v.sortName : sc.get(r));
    out.sort((a, b) => cmp(val(a), val(b), sc.kind) * dir || cmp(a.v.sortName, b.v.sortName, "text") || cmp(b.date, a.date, "date"));
    if (byPasture) {
      const order = new Map([...pastures.map((p) => p.name), "Unassigned"].map((n, i) => [n, i]));
      out.sort((a, b) => (order.get(String(a.v.pasture)) ?? 99) - (order.get(String(b.v.pasture)) ?? 99));
    }
    return out;
  };
  const shown = useMemo(() => apply(cols, rows, dated), [cols, rows, dated, dq, status, sex, bornFrom, bornTo, pasture, breed, color, from, to, sort, byPasture]); // eslint-disable-line
  const sortCol = cols.find((c) => c.key === sort.key) ?? cols[0];

  const pickedRows = picked.size ? shown.filter((r) => picked.has(r.id)) : shown;
  const togglePick = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const visible = shown.slice(0, limit);
  const groups: [string, Row[]][] = byPasture
    ? [...pastures.map((p) => p.name), "Unassigned"].map((n) => [n, visible.filter((r) => r.v.pasture === n)] as [string, Row[]]).filter(([, rs]) => rs.length)
    : [["", visible]];
  const groupTotal = (g: string) => (byPasture ? shown.filter((r) => r.v.pasture === g).length : shown.length);

  const setSortKey = (key: string) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: cols.find((c) => c.key === key)?.kind === "text" ? 1 : -1 }));
  const quickSorts = [
    { value: "name:1", label: "Name A–Z" }, { value: "name:-1", label: "Name Z–A" },
    { value: "dob:1", label: "Birth date, oldest first" }, { value: "dob:-1", label: "Birth date, youngest first" },
    { value: "tag:1", label: "Tag number" }, { value: "pasture:1", label: "Pasture A–Z" },
    { value: "breed:1", label: "Breed A–Z" }, { value: "color:1", label: "Color A–Z" },
    ...(dated ? [{ value: "date:-1", label: "Record date, newest first" }, { value: "date:1", label: "Record date, oldest first" }] : []),
  ];
  const sortValue = `${sort.key}:${sort.dir}`;
  const sortOptions = quickSorts.some((o) => o.value === sortValue) ? quickSorts : [...quickSorts, { value: sortValue, label: `${sortCol.label}, ${sort.dir === 1 ? "ascending" : "descending"}` }];

  const cellText = (c: Col, r: Row) => { const x = c.get(r); return x === null || x === undefined ? "" : c.kind === "date" && x ? String(x) : String(x); };
  const sheetFor = (rep: ReportKey, useSearch: boolean, full = false) => {
    const built = build(rep);
    const hid = full ? new Set<string>() : hiddenFor(rep);
    const b = { ...built, cols: built.cols.filter((c) => c.key === "name" || !hid.has(c.key)) };
    let rs = apply(built.cols, built.rows, datedOf(rep), useSearch);
    if (!full && rep === report && picked.size) rs = rs.filter((r) => picked.has(r.id));
    const columns = [...b.cols.map((c) => ({ label: c.label, kind: c.kind })), { label: "Status", kind: "text" }];
    const hasStatus = b.cols.some((c) => c.key === "status");
    return {
      name: REPORTS.find((r) => r.value === rep)!.label,
      columns: hasStatus ? columns.slice(0, -1) : columns,
      rows: rs.map((r) => {
        const cap = (x: unknown) => (typeof x === "string" && x ? x[0].toUpperCase() + x.slice(1) : x);
        const cells = b.cols.map((c) => (c.key === "name" ? r.v.name : c.key === "age" ? age(String(r.v.dob || "")) : ["sex", "status", "bstatus", "strength", "method"].includes(c.key) ? cap(c.get(r)) : c.get(r) ?? ""));
        return hasStatus ? cells : [...cells, cap(r.animal?.status ?? "")];
      }),
    };
  };
  // Downloads go through the server (works inside the app preview frame): post the table, get a file back
  const download = (format: "xlsx" | "csv", everything = false) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const payload = everything
      ? { format: "xlsx", filename: `goat-joy-all-reports-${stamp}`, sheets: REPORTS.map((r) => sheetFor(r.value, false, true)) }
      : { format, filename: `goat-joy-${report}-${stamp}`, sheets: [sheetFor(report, true)] };
    const form = document.createElement("form");
    form.method = "POST"; form.action = `${API_BASE}/api/report-file`; form.target = "_blank"; form.style.display = "none";
    const input = document.createElement("input");
    input.type = "hidden"; input.name = "payload"; input.value = JSON.stringify(payload);
    form.appendChild(input); document.body.appendChild(form); form.submit(); form.remove();
  };
  const [sheetsHelp, setSheetsHelp] = useState(false);

  /* ---------- Paper-saving print ---------- */
  // Columns that are empty for every printed row are dropped; wide reports turn the page sideways
  const printCols = vcols.filter((c) => c.key === "name" || pickedRows.some((r) => { const x = c.get(r); return x !== null && x !== undefined && x !== ""; }));
  const doPrint = (large: boolean) => { setBigPrint(large); setTimeout(() => window.print(), 50); };
  const printText = (c: Col, r: Row) => {
    const x = c.key === "name" ? r.v.name : c.key === "age" ? age(String(r.v.dob || "")) : c.get(r);
    if (x === null || x === undefined || x === "") return "";
    return c.kind === "date" ? pDate(x) : c.key === "lbs" && report === "milk" ? Number(x).toFixed(1) : String(x);
  };
  const filterLine = [
    dated && (from || to) ? (from === to ? pDate(from) : `${from ? pDate(from) : "start"} – ${to ? pDate(to) : "today"}`) : "",
    q ? `search “${q}”` : "", pasture !== "all" ? pName(Number(pasture)) || "Unassigned" : "", breed !== "all" ? breedOptions(all).find(([k]) => k === breed)?.[1] : "",
    color !== "all" ? color : "", sex !== "all" ? SEX_LABEL[sex] : "",
    bornFrom || bornTo ? `born ${bornFrom && bornTo ? `${pDate(bornFrom)} – ${pDate(bornTo)}` : bornFrom ? `on or after ${pDate(bornFrom)}` : `on or before ${pDate(bornTo)}`}` : "", status !== "active" ? (status === "all" ? "everyone on file" : status) : "", picked.size ? `${picked.size} ticked rows` : "",
  ].filter(Boolean).join(" · ");
  const PrintReport = () => {
    const pGroups: [string, Row[]][] = byPasture
      ? [...pastures.map((p) => p.name), "Unassigned"].map((n) => [n, pickedRows.filter((r) => r.v.pasture === n)] as [string, Row[]]).filter(([, rs]) => rs.length)
      : [["", pickedRows]];
    const landscape = printCols.length > 7;
    return (
      <div className={cn("report-print hidden print:block", bigPrint && "report-print-lg")} data-testid="print-report">
        <style>{`@page { size: letter ${landscape ? "landscape" : "portrait"}; margin: 0.4in; }`}</style>
        <div className="rp-head">
          <div><span className="rp-title">{REPORTS.find((x) => x.value === report)!.label}</span>{filterLine && <span className="rp-filters"> · {filterLine}</span>}</div>
          <div className="rp-meta">{farmName || "Herd"} · {pickedRows.length} record{pickedRows.length === 1 ? "" : "s"} · printed {pDate(new Date().toISOString().slice(0, 10))}</div>
        </div>
        <table className="rp-table">
          <thead><tr>{printCols.map((c) => <th key={c.key} className={cn(c.kind === "num" && "num")}>{c.label}</th>)}</tr></thead>
          <tbody>
            {pGroups.map(([g, rs]) => (
              <Fragment key={g || "all"}>
                {byPasture && <tr className="rp-group"><td colSpan={printCols.length}>{g} · {rs.length}</td></tr>}
                {rs.map((r) => (
                  <tr key={r.id}>{printCols.map((c) => <td key={c.key} className={cn(c.kind === "num" && "num", c.key === "name" && "nm", c.wide && "wide")}>{printText(c, r)}</td>)}</tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  const open = (r: Row) => r.animal && nav(`/animal/${r.animal.id}`);
  const SortIcon = ({ k }: { k: string }) => (sort.key !== k ? <ArrowUpDown className="h-3 w-3 opacity-40" /> : sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />);
  const clearAll = () => { setAsked(false); setPicked(new Set()); setQ(""); setPasture("all"); setStatus("active"); setBreed("all"); setColor("all"); setSex("all"); setBornFrom(""); setBornTo(""); setFrom(""); setTo(""); };
  const filtered = q || pasture !== "all" || breed !== "all" || color !== "all" || status !== "active" || sex !== "all" || bornFrom || bornTo || from || to;

  return (
    <>
    <PrintReport />
    <div className="print:hidden">
      <PageHeader title="Reports" sub="Search any record, then sort by name, birth date or pasture.">
        <div className="flex gap-2 print:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" data-testid="button-print"><Printer />Print<ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{pickedRows.length} rows · {printCols.length} columns · {printCols.length > 7 ? "landscape" : "portrait"}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => doPrint(false)} disabled={!pickedRows.length} data-testid="menu-print">Print (compact, easy-read text)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doPrint(true)} disabled={!pickedRows.length} data-testid="menu-print-large">Print with larger text</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button data-testid="button-export"><Download />Export<ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">This report{picked.size ? `, ${picked.size} selected rows` : `, as shown (${shown.length} rows)`} · chosen columns</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => download("xlsx")} disabled={!shown.length} data-testid="menu-export-xlsx"><FileSpreadsheet />Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { download("xlsx"); setSheetsHelp(true); }} disabled={!shown.length} data-testid="menu-export-sheets"><Sheet />Google Sheets</DropdownMenuItem>
              <DropdownMenuItem onClick={() => download("csv")} disabled={!shown.length} data-testid="menu-export-csv"><FileText />CSV</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => download("xlsx", true)} data-testid="menu-export-all"><Files />All reports, every column, one Excel file</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        {REPORTS.map((r) => (
          <button key={r.value} onClick={() => { setReport(r.value); if (!r.dated && sort.key === "date") setSort({ key: "name", dir: 1 }); }} data-testid={`chip-report-${r.value}`}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium hover-elevate", report === r.value ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="mb-3 space-y-3 rounded-lg border bg-card p-3 print:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every field: name, tag, medication, buck, reason, notes, date…"
            onKeyDown={(e) => { if (e.key === "Enter" && typedAsk && (typedAsk.hasDates || typedAsk.kind !== "all")) applyAsk({ report: typedAsk.kind === "all" ? report : typedAsk.kind, from: typedAsk.from, to: typedAsk.to, q: typedAsk.terms.join(" ") }); }}
            className="h-11 pl-9 text-base" data-testid="input-report-search" />
          {q && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setQ("")} aria-label="Clear search"><X className="h-4 w-4" /></button>}
        </div>
        {typedAsk && (typedAsk.hasDates || typedAsk.kind !== "all") && (
          <button onClick={() => applyAsk({ report: typedAsk.kind === "all" ? report : typedAsk.kind, from: typedAsk.from, to: typedAsk.to, q: typedAsk.terms.join(" ") })}
            className="flex w-full items-center gap-2 rounded-md border border-primary/40 bg-accent/50 px-3 py-2 text-left text-sm" data-testid="button-apply-ask">
            <MessageSquareText className="h-4 w-4 shrink-0 text-primary" />
            <span>Press Enter to show <span className="font-semibold">{typedAsk.kind === "all" ? REPORTS.find((x) => x.value === report)!.label : REPORTS.find((x) => x.value === typedAsk.kind)?.label}</span> · {typedAsk.rangeLabel}{typedAsk.terms.length ? ` · “${typedAsk.terms.join(" ")}”` : ""}</span>
          </button>
        )}
        {asked && !typedAsk && dated && (from || to) && (
          <div className="flex items-center gap-2 text-sm" data-testid="text-ask-applied"><MessageSquareText className="h-4 w-4 text-primary" />
            <span>Showing {REPORTS.find((x) => x.value === report)!.label.toLowerCase()} {from === to ? `on ${fmtShort(from)}` : `${from ? `from ${pDate(from)}` : ""} ${to ? `to ${pDate(to)}` : ""}`}, oldest first. Print or export below.</span></div>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Sort by</Label>
            <Pick value={sortValue} onChange={(v) => { const [key, dir] = v.split(":"); setSort({ key, dir: Number(dir) as 1 | -1 }); }} options={sortOptions} testId="select-sort" /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Pasture</Label>
            <Pick value={pasture} onChange={setPasture} options={[{ value: "all", label: "All pastures" }, ...pastures.map((p) => ({ value: String(p.id), label: p.name })), { value: "none", label: "Unassigned" }]} testId="select-pasture" /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Goats</Label>
            <Pick value={status} onChange={setStatus} options={[{ value: "active", label: "In herd now" }, { value: "sold", label: "Sold" }, { value: "deceased", label: "Deceased" }, { value: "all", label: "Everyone on file" }]} testId="select-status" /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Sex</Label>
            <Pick value={sex} onChange={setSex} options={[{ value: "all", label: "All sexes" }, { value: "doe", label: "Does" }, { value: "buck", label: "Bucks" }, { value: "wether", label: "Wethers" }]} testId="select-report-sex" /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Breed</Label>
            <Pick value={breed} onChange={(v) => { setBreed(v); setColor("all"); }} options={[{ value: "all", label: "All breeds" }, ...breedOptions(all).map(([k, l]) => ({ value: k, label: l }))]} testId="select-report-breed" /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Color</Label>
            <Pick value={color} onChange={setColor} options={[{ value: "all", label: "Any color" }, ...colorOptions(all, breed).map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))]} testId="select-report-color" /></div>
          <div className="flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Switch checked={byPasture} onCheckedChange={setByPasture} data-testid="switch-group-pasture" />Group by pasture
            </label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:max-w-3xl">
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Born from</Label><Input type="date" value={bornFrom} max={bornTo || undefined} onChange={(e) => setBornFrom(e.target.value)} data-testid="input-born-from" /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Born to</Label><Input type="date" value={bornTo} min={bornFrom || undefined} onChange={(e) => setBornTo(e.target.value)} data-testid="input-born-to" /></div>
          {dated && (<>
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Records from</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-from" /></div>
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Records to</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-to" /></div>
          </>)}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm" data-testid="button-columns"><Columns3 />Columns · {vcols.length} of {cols.length}<ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70vh] w-60 overflow-y-auto">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Pick what goes on screen, print and export</DropdownMenuLabel>
            {cols.map((c) => (
              <DropdownMenuCheckboxItem key={c.key} checked={c.key === "name" || !hidden.has(c.key)} disabled={c.key === "name"} onSelect={(e) => e.preventDefault()} onCheckedChange={() => toggleCol(c.key)} data-testid={`check-col-${c.key}`}>{c.label}</DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => setHidden(report, [])} data-testid="button-cols-all">Tick every column</DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => setHidden(report, DEFAULT_HIDE[report] ?? [])} data-testid="button-cols-default">Back to the standard set</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {picked.size > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-accent px-2.5 py-1 text-xs font-medium" data-testid="text-picked">
            {picked.size} row{picked.size === 1 ? "" : "s"} ticked · print and export include only these
            <button className="text-primary hover:underline" onClick={() => setPicked(new Set())} data-testid="button-clear-picked">Clear</button>
          </div>
        )}
      </div>
      <div className="mb-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span data-testid="text-report-count">{shown.length} of {rows.length} records{byPasture ? ` · ${new Set(shown.map((r) => r.v.pasture)).size} pastures` : ""}</span>
        {filtered && <button onClick={clearAll} className="text-primary hover:underline print:hidden" data-testid="button-clear-filters">Clear filters</button>}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : shown.length === 0 ? (
        <Empty icon={FileSearch} title={rows.length ? "No matching records" : "Nothing recorded yet"}>{rows.length ? "Try a different search, pasture or date range." : "Records appear here as you enter them."}</Empty>
      ) : (
        <>
          {/* Desktop / print: sortable table */}
          <div className="hidden overflow-x-auto rounded-lg border bg-card md:block print:block">
            <table className="w-full text-sm" data-testid="table-report">
              <thead className="sticky top-0 bg-secondary/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 pl-3"><Checkbox checked={shown.length > 0 && picked.size === shown.length ? true : picked.size ? "indeterminate" : false} onCheckedChange={(v) => setPicked(v ? new Set(shown.map((r) => r.id)) : new Set())} aria-label="Tick all rows" data-testid="check-all-rows" /></th>
                  {vcols.map((c) => (
                    <th key={c.key} className={cn("whitespace-nowrap px-3 py-2 font-semibold", c.kind === "num" && "text-right")}>
                      <button onClick={() => setSortKey(c.key)} className="inline-flex items-center gap-1 hover:text-foreground" data-testid={`sort-${c.key}`}>{c.label}<SortIcon k={c.key} /></button>
                    </th>
                  ))}
                  <th className="w-6 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {groups.map(([g, rs]) => (
                  <Fragment key={g || "all"}>
                    {byPasture && (
                      <tr className="border-t bg-accent/50"><td colSpan={vcols.length + 2} className="px-3 py-1.5 text-xs font-semibold">{g} <span className="font-normal text-muted-foreground">· {groupTotal(g)}</span></td></tr>
                    )}
                    {rs.map((r) => {
                      const link = r.animal?.status === "active";
                      return (
                        <tr key={r.id} onClick={() => link && open(r)} className={cn("border-t", link ? "cursor-pointer hover-elevate" : "opacity-75")} data-testid={`row-report-${r.id}`}>
                          <td className="pl-3 align-top pt-2" onClick={(e) => e.stopPropagation()}><Checkbox checked={picked.has(r.id)} onCheckedChange={() => togglePick(r.id)} aria-label="Tick this row" data-testid={`check-row-${r.id}`} /></td>
                          {vcols.map((c) => (
                            <td key={c.key} className={cn("px-3 py-2 align-top", c.kind === "num" && "text-right tabular-nums", c.wide ? "min-w-40" : "whitespace-nowrap")}>
                              {c.fmt ? c.fmt(r) : cellText(c, r) || <span className="text-muted-foreground">—</span>}
                              {c.key === "name" && r.animal && r.animal.status !== "active" && <Badge variant="outline" className="ml-1.5 capitalize">{r.animal.status}</Badge>}
                            </td>
                          ))}
                          <td className="pr-2 text-muted-foreground print:hidden">{link && <ChevronRight className="h-4 w-4" />}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: cards */}
          <div className="space-y-4 md:hidden print:hidden">
            {groups.map(([g, rs]) => (
              <div key={g || "all"}>
                {byPasture && <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{g} · {groupTotal(g)}</div>}
                <ul className="overflow-hidden rounded-lg border bg-card">
                  {rs.map((r) => {
                    const link = r.animal?.status === "active";
                    const extra = vcols.filter((c) => !["name", "tag"].includes(c.key) && cellText(c, r));
                    return (
                      <li key={r.id} className="flex items-start border-b last:border-b-0">
                        <div className="pl-3 pt-3.5"><Checkbox checked={picked.has(r.id)} onCheckedChange={() => togglePick(r.id)} aria-label="Tick this row" data-testid={`check-card-${r.id}`} /></div>
                        <button disabled={!link} onClick={() => open(r)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left", link ? "hover-elevate" : "opacity-75")} data-testid={`card-report-${r.id}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <span className="truncate">{r.v.name}</span>
                              {r.v.tag && <span className="font-normal text-muted-foreground">#{r.v.tag}</span>}
                              {r.animal && r.animal.status !== "active" && <Badge variant="outline" className="capitalize">{r.animal.status}</Badge>}
                            </div>
                            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                              {extra.map((c) => (
                                <div key={c.key} className={cn("min-w-0", c.wide && "col-span-2")}>
                                  <dt className="inline text-muted-foreground">{c.label}: </dt>
                                  <dd className="inline">{c.fmt ? c.fmt(r) : cellText(c, r)}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                          {link && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {shown.length > visible.length && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm print:hidden" data-testid="pager-report">
              <span className="text-muted-foreground">Showing {visible.length.toLocaleString()} of {shown.length.toLocaleString()}. Search and sort still cover every record; exports include them all.</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)} data-testid="button-show-more">Show {Math.min(PAGE, shown.length - visible.length)} more</Button>
                {shown.length <= 2000 && <Button variant="ghost" size="sm" onClick={() => setLimit(shown.length)} data-testid="button-show-all">Show all</Button>}
              </div>
            </div>
          )}
        </>
      )}
      <Dialog open={sheetsHelp} onOpenChange={setSheetsHelp}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open in Google Sheets</DialogTitle>
            <DialogDescription>Your report downloaded as an Excel file. Google Sheets opens it as-is, with dates and numbers intact.</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>Open Google Sheets (button below). A new blank sheet opens.</li>
            <li>Choose <span className="font-semibold">File → Import → Upload</span>.</li>
            <li>Pick the downloaded file (goat-joy-{report}-…xlsx), then <span className="font-semibold">Replace spreadsheet</span>.</li>
          </ol>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSheetsHelp(false)}>Done</Button>
            <Button asChild><a href="https://sheets.new" target="_blank" rel="noopener noreferrer" data-testid="link-open-sheets"><ExternalLink />Open Google Sheets</a></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
