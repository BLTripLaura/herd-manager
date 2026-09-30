import { normEar } from "@shared/breed";
import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Link2, ClipboardPaste, Download, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { post, API_BASE, fmtDate } from "@/lib/herd";
import { queryClient } from "@/lib/queryClient";
import { errText } from "@/pages/milk";

/* ---------- parsing helpers ---------- */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  const delim = (text.split("\n")[0].match(/\t/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? "\t" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); if (row.some((x) => x.trim())) rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim().replace(/^\ufeff/, "")));
}

type Field = { key: string; label: string; names: string[] };
const FIELDS: Field[] = [
  { key: "name", label: "Name", names: ["name", "registered name", "animal name", "goat name", "animal", "goat"] },
  { key: "barnName", label: "Barn name", names: ["barn name", "barnname", "nickname", "nick name", "call name", "pet name", "barn"] },
  { key: "tag", label: "Herd tag #", names: ["tag", "tag #", "tag number", "id", "ear tag", "scrapie tag", "herd #", "number", "#"] },
  { key: "tattooLocation", label: "Tattoo location", names: ["tattoo location", "tattoo loc", "tattoo place"] },
  { key: "tattooRight", label: "Tattoo right", names: ["tattoo right", "tattoo (r)", "right tattoo", "right ear", "tattoo r", "r tattoo", "rt tattoo"] },
  { key: "tattooLeft", label: "Tattoo left", names: ["tattoo left", "tattoo (l)", "left tattoo", "left ear", "tattoo l", "l tattoo", "lt tattoo", "tattoo"] },
  { key: "microchip", label: "Microchip #", names: ["microchip", "microchip #", "microchip number", "chip", "chip #", "chip number", "rfid", "eid"] },
  { key: "chipLocation", label: "Microchip location", names: ["microchip location", "chip location", "chip loc"] },
  { key: "hornStatus", label: "Horn status", names: ["horn status", "horns", "horned", "disbudded", "polled"] },
  { key: "earType", label: "Ear type", names: ["ear type", "ears", "ear", "ear style"] },
  { key: "eyeColor", label: "Eye color", names: ["eye color", "eye colour", "eyes"] },
  { key: "regNumber", label: "Reg #", names: ["adga id", "adga", "reg", "reg #", "reg no", "reg. #", "registration", "registration #", "registration number", "adga", "adga #", "reg number", "reg num"] },
  { key: "sex", label: "Sex", names: ["sex", "gender", "type"] },
  { key: "dob", label: "Birth date", names: ["dob", "birth date", "date of birth", "born", "birthdate", "birthday", "kidding date", "birth"] },
  { key: "breed", label: "Breed", names: ["breed", "breed type"] },
  { key: "herdbook", label: "Herdbook", names: ["herdbook", "herd book", "registry", "herdbook type"] },
  { key: "color", label: "Color", names: ["color", "colour", "color/markings", "markings", "color & markings"] },
  { key: "pasture", label: "Pasture", names: ["pasture", "pasture group", "paddock", "field", "pen", "location", "barn"] },
  { key: "groupName", label: "Group", names: ["group", "herd group", "string", "class"] },
  { key: "sire", label: "Sire", names: ["sire", "sire name", "father", "sire adga id"] },
  { key: "dam", label: "Dam", names: ["dam", "dam name", "mother", "dam adga id"] },
  { key: "inMilk", label: "In milk", names: ["in milk", "milking", "lactating", "in milk?", "milker"] },
  { key: "status", label: "Status", names: ["status", "herd status", "active"] },
  { key: "pedigreeUrl", label: "Pedigree link", names: ["pedigree", "pedigree link", "pedigree url", "link", "url"] },
  { key: "notes", label: "Notes", names: ["notes", "comments", "note", "remarks"] },
];
const FIELD_LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

function autoMap(header: string[]) {
  const used = new Set<string>();
  return header.map((h) => {
    const v = h.trim().toLowerCase().replace(/\s+/g, " ");
    const f = FIELDS.find((f) => !used.has(f.key) && f.names.includes(v));
    if (f) { used.add(f.key); return f.key; }
    return "skip";
  });
}

function normSex(s: string) {
  const v = s.trim().toLowerCase();
  if (!v) return "doe";
  if (v.startsWith("w")) return "wether";
  if (v.startsWith("b") || v === "m" || v === "male" || v.startsWith("ram") || v === "billy") return "buck";
  return "doe";
}
const pad = (n: number) => String(n).padStart(2, "0");
export function normDate(s: string): string | null | undefined {
  const v = s.trim(); if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  let m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? (Number(m[3]) > 50 ? `19${m[3]}` : `20${m[3]}`) : m[3];
    const mo = Number(m[1]), d = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = v.match(/^(\d{5})(\.\d+)?$/); // Excel serial date
  if (m) { const d = new Date(Date.UTC(1899, 11, 30) + Number(m[1]) * 86400000); return d.toISOString().slice(0, 10); }
  const d = new Date(v);
  if (isNaN(d.getTime()) || d.getFullYear() < 1990) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Spreadsheets saved from websites sometimes keep codes like &#39; for an apostrophe */
export function decodeEntities(s: string) {
  return s.replace(/&(#\d+|#x[\da-f]+|amp|quot|apos|lt|gt|nbsp);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k[0] === "#") return String.fromCodePoint(k[1] === "x" ? parseInt(k.slice(2), 16) : Number(k.slice(1)));
    return ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " } as any)[k] ?? m;
  });
}
const BREEDS: Record<string, string> = { alpine: "Alpine", ober: "Oberhasli", oberhasli: "Oberhasli", lamancha: "Lamancha", "nigerian dwarf": "Nigerian Dwarf", nigerian: "Nigerian Dwarf", nubian: "Nubian", saanen: "Saanen", toggenburg: "Toggenburg", "sable": "Sable", "golden guernsey": "Golden Guernsey", experimental: "Experimental" };
/** Tidy breed spellings: "LaMancha" → Lamancha, "50 Alpine/50Ober" → 50% Alpine 50% Oberhasli */
export function normBreed(v: string) {
  const s = v.trim().replace(/\s+/g, " ");
  const parts = Array.from(s.matchAll(/(\d{1,3})\s*%?\s*([a-z][a-z ]*?)(?=\s*[/,&+]|\s*\d|$)/gi));
  if (parts.length >= 2) {
    const named = parts.map((m) => ({ pct: Number(m[1]), b: BREEDS[m[2].trim().toLowerCase()] ?? m[2].trim() }));
    if (named.reduce((t, x) => t + x.pct, 0) === 100) return named.sort((a, b) => a.b.localeCompare(b.b)).map((x) => `${x.pct}% ${x.b}`).join(" ");
  }
  return BREEDS[s.toLowerCase()] ?? s;
}
export function normHerdbook(v: string) {
  const s = v.trim().toLowerCase();
  if (s.startsWith("pure")) return "Purebred";
  if (s.startsWith("amer")) return "American";
  if (s.startsWith("exp")) return "Experimental";
  if (s.startsWith("grade")) return "Grade";
  return v.trim();
}
const yes = (s: string) => /^(y|yes|true|1|x|✓|milking|in milk)$/i.test(s.trim());
function normStatus(s: string) {
  const v = s.trim().toLowerCase();
  if (!v || v.startsWith("act") || v === "yes" || v === "y") return "active";
  if (v.startsWith("sold")) return "sold";
  if (v.startsWith("dec") || v.startsWith("dead") || v.startsWith("died") || v.startsWith("cull")) return "deceased";
  return "active";
}

type Rec = Record<string, any> & { _row: number; _bad: string[] };
type Group = { rows: number[]; data: Record<string, any>; clashes: string[] };
type Check = { matchId: number | null; matchName?: string; matchTag?: string | null; confidence: "none" | "sure" | "possible"; reasons: string[]; warnings: string[]; fills: string[]; diffs: { field: string; app: any; file: any }[] };
type Decision = { action: "" | "new" | "merge" | "skip"; replace: boolean };
const LABEL = (f: string) => (f === "pasture" ? "Pasture" : f === "inMilk" ? "In milk" : FIELD_LABEL[f] ?? f);
const show = (f: string, v: any) => (v === null || v === undefined || v === "" ? "blank" : f === "dob" ? fmtDate(v) : String(v));

/* ---------- component ---------- */
export function ImportAnimals() {
  const { toast } = useToast();
  const [raw, setRaw] = useState<string[][]>([]);
  const [source, setSource] = useState("");
  const [map, setMap] = useState<string[]>([]);
  const [paste, setPaste] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<"" | "file" | "link" | "import">("");
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [done, setDone] = useState<null | { created: number; updated: number; filled: number; unchanged: number; skipped: number; pasturesCreated: string[]; errors: string[] }>(null);
  const fileRef = useRef<File | null>(null);

  const load = (rows: string[][], label: string) => {
    // skip leading title rows: header = first row with 2+ filled cells
    const start = Math.max(0, rows.findIndex((r) => r.filter(Boolean).length >= 2));
    const rs = rows.slice(start);
    setRaw(rs); setMap(autoMap(rs[0] ?? [])); setSource(label); setDone(null);
    if (!rs.length) toast({ title: "No rows found", description: "The sheet looks empty.", variant: "destructive" });
  };

  const readXlsx = async (f: File, sheet = 0) => {
    setBusy("file");
    try {
      const res = await fetch(`${API_BASE}/api/import/parse?sheet=${sheet}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: await f.arrayBuffer() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message);
      setSheets(j.sheets); setSheetIdx(j.sheet);
      load(j.rows, `${f.name}${j.sheets.length > 1 ? ` · ${j.sheets[j.sheet]}` : ""}`);
    } catch (e) { toast({ title: "Couldn't read that file", description: errText(e), variant: "destructive" }); }
    setBusy("");
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    fileRef.current = f; setSheets([]);
    if (/\.xlsx$/i.test(f.name) || f.type.includes("spreadsheetml")) return readXlsx(f);
    if (/\.xls$/i.test(f.name)) { toast({ title: "Older Excel file", description: "Open it in Excel and choose Save As → Excel Workbook (.xlsx) or CSV, then upload that.", variant: "destructive" }); return; }
    load(parseCsv(await f.text()), f.name);
  };
  const fetchLink = async () => {
    setBusy("link");
    try { const j = await post("/api/import/sheet-url", { url: link }); load(parseCsv(j.text), "Google Sheet"); }
    catch (e) { toast({ title: "Couldn't open that sheet", description: errText(e), variant: "destructive" }); }
    setBusy("");
  };

  const header = raw[0] ?? [];
  const records: Rec[] = useMemo(() => raw.slice(1).map((r, i) => {
    const o: Rec = { _row: i + 2, _bad: [] };
    map.forEach((k, c) => {
      if (k === "skip") return;
      const v = decodeEntities(r[c] ?? "").trim();
      if (!v || (o[k] !== undefined && o[k] !== "")) return;
      if (k === "sex") o.sex = normSex(v);
      else if (k === "dob") { const d = normDate(v); if (d) o.dob = d; else o._bad.push(`birth date "${v}"`); }
      else if (k === "inMilk") o.inMilk = yes(v);
      else if (k === "status") o.status = normStatus(v);
      else if (k === "tattooLocation" || k === "chipLocation") o[k] = /tail/i.test(v) ? "tail" : "ear";
      else if (k === "hornStatus") { const h = v.toLowerCase(); o.hornStatus = h.startsWith("poll") ? "polled" : h.startsWith("scur") ? "scurs" : h.startsWith("horn") ? "horned" : "disbudded"; }
      else if (k === "microchip") o.microchip = v.replace(/\D/g, "");
      else if (k === "regNumber") { if (/pend/i.test(v)) o.notes = [o.notes, "ADGA registration pending"].filter(Boolean).join("\n"); else o.regNumber = v.toUpperCase(); }
      else if (k === "breed") o.breed = normBreed(v);
      else if (k === "herdbook") o.herdbook = normHerdbook(v);
      else if (k === "earType") o.earType = normEar(v);
      else if (k === "eyeColor") o.eyeColor = v.replace(/^./, (c) => c.toUpperCase());
      else o[k] = v;
    });
    return o;
  }), [raw, map]);

  const norm = (x: any) => String(x ?? "").trim().toLowerCase();
  const hasName = map.includes("name");
  const noName = records.filter((r) => !r.name).length;
  const badDates = records.filter((r) => r._bad.length);

  // 1. Rows in the file that are the same goat (same reg #, microchip or name) are combined into one
  const groups: Group[] = useMemo(() => {
    const out: Group[] = [];
    const keyOf = (r: Rec) => [r.regNumber && `r:${norm(r.regNumber).replace(/[\s.-]/g, "")}`, r.microchip && r.microchip.length >= 9 && `c:${r.microchip}`, r.name && `n:${norm(r.name)}`].filter(Boolean) as string[];
    const idx = new Map<string, number>();
    for (const r of records) {
      if (!r.name) continue;
      const { _row, _bad, ...data } = r;
      const keys = keyOf(r);
      const at = keys.map((k) => idx.get(k)).find((x) => x !== undefined);
      if (at === undefined) { out.push({ rows: [_row], data, clashes: [] }); keys.forEach((k) => idx.set(k, out.length - 1)); continue; }
      const g = out[at]; g.rows.push(_row);
      for (const [f, v] of Object.entries(data)) {
        if (g.data[f] === undefined || g.data[f] === "") g.data[f] = v;
        else if (f === "notes") { if (!norm(g.data.notes).includes(norm(v))) g.data.notes = `${g.data.notes}\n${v}`; }
        else if (norm(g.data[f]) !== norm(v) && !g.clashes.includes(f)) g.clashes.push(f);
      }
      keys.forEach((k) => idx.set(k, at));
    }
    return out;
  }, [records]);

  // 2. Ask the app which goats it already has
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [decide, setDecide] = useState<Record<number, Decision>>({});
  useEffect(() => {
    if (!hasName || !groups.length) { setChecks(null); return; }
    let live = true; setChecking(true);
    const t = setTimeout(async () => {
      try {
        const c: Check[] = await post("/api/import/check", { rows: groups.map((g) => g.data) });
        if (!live) return;
        setChecks(c);
        setDecide(Object.fromEntries(c.map((x, i) => [i, x.confidence === "sure" ? { action: "merge", replace: false } : x.confidence === "none" ? { action: "new", replace: false } : { action: "", replace: false }])));
      } catch (e) { if (live) toast({ title: "Couldn't check for duplicates", description: errText(e), variant: "destructive" }); }
      if (live) setChecking(false);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [groups, hasName]);

  const plan = groups.map((_, i) => decide[i]?.action ?? "");
  const counts = { new: plan.filter((p) => p === "new").length, merge: plan.filter((p) => p === "merge").length, skip: plan.filter((p) => p === "skip").length, open: plan.filter((p) => p === "").length };
  const matched = (checks ?? []).map((c, i) => ({ c, i, g: groups[i] })).filter((x) => x.c.matchId);
  const combined = groups.filter((g) => g.rows.length > 1);
  const newPastures = Array.from(new Set(records.map((r) => r.pasture).filter(Boolean).map((p: string) => p.trim())));
  const mappedCols = map.map((k, i) => ({ k, i })).filter((x) => x.k !== "skip");
  const setOne = (i: number, d: Partial<Decision>) => setDecide((m) => ({ ...m, [i]: { ...m[i], ...d } as Decision }));

  const doImport = async () => {
    if (!checks) return;
    setBusy("import");
    try {
      const rows = groups.map((g, i) => ({ data: g.data, row: g.rows[0], action: decide[i]?.action || "skip", matchId: checks[i]?.matchId, replace: !!decide[i]?.replace }));
      const j = await post("/api/import/animals", { rows });
      setDone({ ...j, skipped: j.skipped + noName }); setRaw([]); setPaste(""); setLink(""); setChecks(null);
      queryClient.invalidateQueries();
      toast({ title: `Import finished: ${j.created} added, ${j.filled + j.updated} updated` });
    } catch (e) { toast({ title: "Import failed", description: errText(e), variant: "destructive" }); }
    setBusy("");
  };

  const template = (format: "xlsx" | "csv") => {
    const cols = ["Name", "Barn name", "Tag", "Reg #", "Sex", "Date of birth", "Breed", "Color", "Eye color", "Horn status", "Tattoo location", "Tattoo right", "Tattoo left", "Microchip location", "Microchip", "Pasture", "Sire", "Dam", "In milk", "Status", "Pedigree link", "Notes"];
    const payload = {
      format, filename: "goat-joy-herd-import-template",
      sheets: [{ name: "Herd", columns: cols.map((label) => ({ label, kind: label === "Date of birth" ? "date" : "text" })), rows: [
        ["Sunny Acres Night Owl", "Owlie", "109", "D2300001", "Doe", "2025-03-12", "Oberhasli", "Chamoisee", "Brown", "Disbudded", "Ear", "GJY", "S3", "Base of ear", "985112001234567", "Front Pasture", "Goat Joy Onyx", "Goat Joy Licorice", "Yes", "Active", "", ""],
        ["Sunny Acres Thunder", "Boomer", "205", "", "Buck", "2024-04-02", "Oberhasli", "Black", "Brown", "Polled", "Tail", "GJY", "R1", "Tail", "", "Buck Pen", "", "", "No", "Active", "", "Herd sire"],
      ] }],
    };
    const form = document.createElement("form");
    form.method = "POST"; form.action = `${API_BASE}/api/report-file`; form.target = "_blank"; form.style.display = "none";
    const input = document.createElement("input"); input.type = "hidden"; input.name = "payload"; input.value = JSON.stringify(payload);
    form.appendChild(input); document.body.appendChild(form); form.submit(); form.remove();
  };

  return (
    <section className="min-w-0 rounded-lg border bg-card p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold"><Upload className="h-4 w-4 text-primary" />Import goats</h2>
      <p className="mb-3 text-sm text-muted-foreground">Bring in your whole herd from Excel, CSV or Google Sheets. The first row should be column headings; you'll match them to app fields and confirm any goats already in the app before anything is saved. Import again any time to add details that were missing.</p>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Starting from scratch?</span>
        <Button variant="outline" size="sm" onClick={() => template("xlsx")} data-testid="button-template-xlsx"><Download />Excel template</Button>
        <Button variant="outline" size="sm" onClick={() => template("csv")} data-testid="button-template-csv"><Download />CSV template</Button>
      </div>

      <Tabs defaultValue="file">
        <TabsList className="w-full">
          <TabsTrigger value="file" className="flex-1 gap-1.5" data-testid="tab-import-file"><FileSpreadsheet className="h-3.5 w-3.5" />File</TabsTrigger>
          <TabsTrigger value="link" className="flex-1 gap-1.5" data-testid="tab-import-link"><Link2 className="h-3.5 w-3.5" />Google Sheet</TabsTrigger>
          <TabsTrigger value="paste" className="flex-1 gap-1.5" data-testid="tab-import-paste"><ClipboardPaste className="h-3.5 w-3.5" />Paste</TabsTrigger>
        </TabsList>
        <TabsContent value="file">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground hover-elevate">
            {busy === "file" ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSpreadsheet className="h-5 w-5" />}
            <span className="font-medium text-foreground">Choose an Excel (.xlsx) or CSV file</span>
            <span className="text-xs">ADGA herd reports and other farm software exports work too</span>
            <input type="file" accept=".xlsx,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
              onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} data-testid="input-import-file" />
          </label>
          {sheets.length > 1 && fileRef.current && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sheet</span>
              <Select value={String(sheetIdx)} onValueChange={(v) => readXlsx(fileRef.current!, Number(v))}>
                <SelectTrigger className="h-8 w-48" data-testid="select-import-sheet"><SelectValue /></SelectTrigger>
                <SelectContent>{sheets.map((s, i) => <SelectItem key={i} value={String(i)}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </TabsContent>
        <TabsContent value="link">
          <div className="flex gap-2">
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" data-testid="input-import-link" />
            <Button onClick={fetchLink} disabled={!link.trim() || busy === "link"} data-testid="button-import-link">{busy === "link" ? <Loader2 className="animate-spin" /> : "Load"}</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">In Google Sheets, click Share and set General access to "Anyone with the link." Or copy the cells and use Paste instead; that works with private sheets.</p>
        </TabsContent>
        <TabsContent value="paste">
          <Textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} className="font-mono text-xs" data-testid="input-import-paste"
            placeholder={"Select your rows (including the heading row) in Excel or Google Sheets, copy, and paste here."} />
          <Button className="mt-2" variant="outline" size="sm" onClick={() => load(parseCsv(paste.trim()), "Pasted rows")} disabled={!paste.trim()} data-testid="button-import-paste">Read rows</Button>
        </TabsContent>
      </Tabs>

      {done && (
        <div className="mt-4 rounded-md border border-emerald-600/30 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30" data-testid="text-import-result">
          <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />Import finished</div>
          <div className="mt-1">{[done.created && `${done.created} new ${done.created === 1 ? "goat" : "goats"} added`, done.filled && `${done.filled} filled in with missing details`, done.updated && `${done.updated} updated with file values`, done.unchanged && `${done.unchanged} already complete`, done.skipped && `${done.skipped} skipped`].filter(Boolean).join(" · ") || "Nothing to change"}</div>
          {done.pasturesCreated.length > 0 && <div className="mt-1 text-muted-foreground">New pastures created: {done.pasturesCreated.join(", ")}</div>}
          {done.errors.slice(0, 5).map((e, i) => <div key={i} className="mt-1 text-destructive">{e}</div>)}
        </div>
      )}

      {raw.length > 0 && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold">Match your columns</h3>
              <span className="truncate text-xs text-muted-foreground">{source} · {raw.length - 1} rows</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {header.map((h, i) => (
                <div key={i} className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{h || `Column ${i + 1}`}</div>
                    <div className="truncate text-xs text-muted-foreground">{raw.slice(1, 3).map((r) => r[i]).filter(Boolean).join(" · ") || "empty"}</div>
                  </div>
                  <Select value={map[i] ?? "skip"} onValueChange={(v) => setMap(map.map((m, j) => (j === i ? v : m === v && v !== "skip" ? "skip" : m)))}>
                    <SelectTrigger className={`h-8 w-36 shrink-0 ${map[i] === "skip" ? "text-muted-foreground" : ""}`} data-testid={`select-map-${i}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Don't import</SelectItem>
                      {FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {!hasName ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-testid="text-import-noname">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Choose which column holds each goat's Name to continue.
            </div>
          ) : (
            <>
              <div>
                <h3 className="mb-2 text-sm font-bold">Preview</h3>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted text-left">
                      <tr><th className="px-2 py-1.5 font-semibold"></th>{mappedCols.map(({ k }) => <th key={k} className="whitespace-nowrap px-2 py-1.5 font-semibold">{FIELD_LABEL[k]}</th>)}</tr>
                    </thead>
                    <tbody>
                      {groups.slice(0, 8).map(({ data: r, rows: rr }, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1.5">
                            <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${plan[i] === "new" ? "bg-primary/10 text-primary" : plan[i] === "merge" ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" : plan[i] === "" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" : "bg-muted text-muted-foreground"}`}>{checking && !checks ? "…" : plan[i] === "" ? "check" : plan[i]}</span>
                          </td>
                          {mappedCols.map(({ k }) => {
                            const bad = k === "dob" && records.find((x) => x._row === rr[0])?._bad.length;
                            const v = r[k];
                            return <td key={k} className={`whitespace-nowrap px-2 py-1.5 ${bad ? "text-destructive" : ""}`}>{bad ? "unreadable" : typeof v === "boolean" ? (v ? "Yes" : "No") : k === "dob" && v ? fmtDate(v) : k === "sex" || k === "status" ? String(v ?? "").replace(/^./, (c) => c.toUpperCase()) : v ?? ""}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {groups.length > 8 && <div className="mt-1 text-xs text-muted-foreground">Showing 8 of {groups.length} goats</div>}
              </div>

              <div className="space-y-1.5 text-sm" data-testid="text-import-summary">
                {checking && !checks ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking for goats already in the app…</div> : (
                  <div><b>{counts.new}</b> new {counts.new === 1 ? "goat" : "goats"} · <b>{counts.merge}</b> already in the app (missing details will be added){counts.skip ? <> · <b>{counts.skip}</b> skipped</> : null}{counts.open ? <> · <b className="text-destructive">{counts.open}</b> need your decision</> : null}</div>
                )}
                {newPastures.length > 0 && <div className="text-muted-foreground">Pastures: {newPastures.join(", ")} (any that don't exist yet will be created)</div>}
                {noName > 0 && <div className="text-amber-700 dark:text-amber-300">{noName} {noName === 1 ? "row has" : "rows have"} no name and will be skipped.</div>}
                {badDates.length > 0 && <div className="text-amber-700 dark:text-amber-300">{badDates.length} birth {badDates.length === 1 ? "date" : "dates"} couldn't be read (rows {badDates.slice(0, 6).map((r) => r._row).join(", ")}). Those goats import without a birth date.</div>}
                {combined.length > 0 && <div className="text-amber-700 dark:text-amber-300" data-testid="text-import-combined">{combined.length} {combined.length === 1 ? "goat appears" : "goats appear"} on more than one row in this file ({combined.slice(0, 4).map((g) => `${g.data.name}: rows ${g.rows.join(", ")}`).join("; ")}{combined.length > 4 ? "…" : ""}). Those rows are combined into one goat{combined.some((g) => g.clashes.length) ? "; where they disagree, the first row is used" : ""}.</div>}
              </div>

              {checks && matched.length > 0 && <DuplicateReview items={matched} decide={decide} setOne={setOne} setAll={(conf, d) => matched.forEach(({ c, i }) => c.confidence === conf && setOne(i, d))} />}

              <div className="flex flex-wrap gap-2">
                <Button onClick={doImport} disabled={busy === "import" || !checks || counts.open > 0 || counts.new + counts.merge === 0} data-testid="button-import">
                  {busy === "import" ? <Loader2 className="animate-spin" /> : <Upload />}{counts.open ? `Decide on ${counts.open} possible ${counts.open === 1 ? "match" : "matches"} first` : `Import ${counts.new + counts.merge} goats`}
                </Button>
                <Button variant="ghost" onClick={() => setRaw([])} data-testid="button-import-cancel">Cancel</Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------- duplicate review ---------- */
function DuplicateReview({ items, decide, setOne, setAll }: {
  items: { c: Check; i: number; g: Group }[]; decide: Record<number, Decision>;
  setOne: (i: number, d: Partial<Decision>) => void; setAll: (conf: "sure" | "possible", d: Partial<Decision>) => void;
}) {
  const possible = items.filter((x) => x.c.confidence === "possible");
  const sure = items.filter((x) => x.c.confidence === "sure");
  const [tab, setTab] = useState<"possible" | "sure">(possible.length ? "possible" : "sure");
  const [limit, setLimit] = useState(25);
  const list = tab === "possible" ? possible : sure;
  return (
    <div className="rounded-md border" data-testid="section-duplicates">
      <div className="border-b px-3 py-2">
        <h3 className="text-sm font-bold">Goats already in the app</h3>
        <p className="text-xs text-muted-foreground">Matching goats get only the details they're missing. Nothing already in the app is changed unless you choose "Use file values."</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button size="sm" variant={tab === "possible" ? "default" : "outline"} onClick={() => { setTab("possible"); setLimit(25); }} data-testid="tab-dupes-possible">Possible matches ({possible.length})</Button>
        <Button size="sm" variant={tab === "sure" ? "default" : "outline"} onClick={() => { setTab("sure"); setLimit(25); }} data-testid="tab-dupes-sure">Confirmed matches ({sure.length})</Button>
        <div className="ml-auto flex gap-1">
          {tab === "possible" && possible.length > 1 && <>
            <Button size="sm" variant="ghost" onClick={() => setAll("possible", { action: "merge" })} data-testid="button-dupes-all-merge">All same goat</Button>
            <Button size="sm" variant="ghost" onClick={() => setAll("possible", { action: "new" })} data-testid="button-dupes-all-new">All different</Button>
          </>}
        </div>
      </div>
      {!list.length ? <div className="px-3 py-4 text-sm text-muted-foreground">{tab === "possible" ? "None. Every match is certain." : "None."}</div> : (
        <ul className="divide-y">
          {list.slice(0, limit).map(({ c, i, g }) => {
            const d = decide[i] ?? { action: "", replace: false };
            return (
              <li key={i} className={`space-y-2 px-3 py-3 text-sm ${d.action === "" ? "bg-red-50/60 dark:bg-red-950/20" : ""}`} data-testid={`row-dupe-${i}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{g.data.name} <span className="font-normal text-muted-foreground">(row {g.rows.join(", ")})</span></div>
                    <div className="text-xs text-muted-foreground">matches <b className="text-foreground">{c.matchName}</b>{c.matchTag ? ` #${c.matchTag}` : ""} · {c.reasons.join(", ")}</div>
                    {c.warnings.length > 0 && <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3 w-3" />{c.warnings.join(" · ")}</div>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {([["merge", "Same goat"], ["new", "Different goat"], ["skip", "Skip"]] as const).map(([a, l]) => (
                      <Button key={a} size="sm" variant={d.action === a ? "default" : "outline"} onClick={() => setOne(i, { action: a })} data-testid={`button-dupe-${a}-${i}`}>{l}</Button>
                    ))}
                  </div>
                </div>
                {d.action === "merge" && (
                  <div className="space-y-1 rounded bg-muted/50 px-2 py-1.5 text-xs">
                    <div>{c.fills.length ? <>Will add: <b>{c.fills.map(LABEL).join(", ")}</b></> : c.diffs.length ? "No missing details to add." : "Already complete; nothing will change."}</div>
                    {c.diffs.length > 0 && <>
                      <div className="text-muted-foreground">Different in the file:</div>
                      <ul className="space-y-0.5">{c.diffs.map((x) => <li key={x.field}><b>{LABEL(x.field)}</b>: app has {show(x.field, x.app)} · file has {show(x.field, x.file)}</li>)}</ul>
                      <label className="flex items-center gap-2 pt-1"><Switch checked={d.replace} onCheckedChange={(v) => setOne(i, { replace: v })} data-testid={`switch-dupe-replace-${i}`} /><span>{d.replace ? "Use file values for these" : "Keep what's in the app"}</span></label>
                    </>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {list.length > limit && <div className="border-t px-3 py-2"><Button size="sm" variant="ghost" onClick={() => setLimit(limit + 50)} data-testid="button-dupes-more">Show more ({list.length - limit} left)</Button></div>}
    </div>
  );
}
