import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Bookmark, Copy, FileUp, Loader2, CheckCircle2, AlertTriangle, Download, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { API_BASE } from "@/lib/herd";
import { resize } from "@/components/photos";
import { useHerdInfo } from "@/components/herd-switcher";
import { useMe } from "@/components/auth";

/* EasyKeeper → Herd Manager.
   Step 1 happens on EasyKeeper: the bookmark runs /easykeeper-reader.js there and saves one file.
   Step 2 happens here: the file is sent a few goats at a time, then the photos are copied. */

type EKFile = { format: string; version: number; readAt: string; totalGoats: number; farm?: string; animals: any[] };
type Report = { created: number; updated: number; treatments: number; care: number; weights: number; reminders: number; breedings: number; heats: number; notes: number; lactations: number; skipped: string[] };
const ZERO: Report = { created: 0, updated: 0, treatments: 0, care: 0, weights: 0, reminders: 0, breedings: 0, heats: 0, notes: 0, lactations: 0, skipped: [] };

const readerUrl = () => `${window.location.origin}${API_BASE}/easykeeper-reader.js`;
export const bookmarkletCode = () =>
  `javascript:(function(){var s=document.createElement('script');s.src='${readerUrl()}?v='+Date.now();s.onerror=function(){alert('Could not load the Herd Manager reader. Check your internet connection and try again.')};document.body.appendChild(s);})();`;

/** The draggable "EasyKeeper → Herd Manager" bookmark (React won't render a javascript: link itself, so it's set after mount) */
export function ReaderBookmark() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => { ref.current?.setAttribute("href", bookmarkletCode()); }, []);
  return (
    <a ref={ref} onClick={(e) => { e.preventDefault(); }} draggable
      className="inline-flex cursor-grab items-center gap-2 rounded-md border-2 border-dashed border-primary bg-primary/10 px-3 py-2 text-sm font-semibold text-primary active:cursor-grabbing"
      title="Drag me to your bookmarks bar" data-testid="link-ek-bookmark">
      <Bookmark className="h-4 w-4" />EasyKeeper → Herd Manager
    </a>
  );
}

function countOf(f: EKFile) {
  let health = 0, reminders = 0, breed = 0, notes = 0, photos = 0, progeny = 0;
  const status: Record<string, number> = {};
  for (const a of f.animals) {
    const st = String(a.list?.status || "Unknown"); status[st] = (status[st] ?? 0) + 1;
    for (const t of a.health ?? []) (/scheduled/i.test(t.heading) || t.headers?.some((h: string) => /due/i.test(h)) ? (reminders += t.rows.length) : (health += t.rows.length));
    for (const t of a.breedings ?? []) breed += t.rows.length;
    for (const t of a.notes ?? []) notes += t.rows.length;
    photos += a.photos?.length ?? 0;
    progeny += a.progeny?.length ?? 0;
  }
  return { health, reminders, breed, notes, photos, progeny, status };
}
/** Goats grouped so each request stays well under the hosting limits (size and time) */
function chunks(animals: any[]) {
  const out: any[][] = []; let cur: any[] = [], rows = 0, bytes = 0;
  for (const a of animals) {
    const n = (a.health ?? []).reduce((s: number, t: any) => s + t.rows.length, 0) + 10;
    const b = JSON.stringify(a).length;
    if (cur.length && (cur.length >= 6 || rows + n > 1200 || bytes + b > 2_500_000)) { out.push(cur); cur = []; rows = 0; bytes = 0; }
    cur.push(a); rows += n; bytes += b;
  }
  if (cur.length) out.push(cur);
  return out;
}
const dateFromTitle = (t: string) => {
  const m = String(t ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null; let y = Number(m[3]); if (y < 100) y += 2000;
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};

export function EasyKeeperImport() {
  const { toast } = useToast();
  const me = useMe();
  const { data: herdInfo } = useHerdInfo();
  const [file, setFile] = useState<EKFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [photos, setPhotos] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [phase, setPhase] = useState<"idle" | "records" | "photos" | "done">("idle");
  const [prog, setProg] = useState({ n: 0, of: 1, label: "" });
  const [report, setReport] = useState<Report>(ZERO);
  const [finish, setFinish] = useState<{ tidied: number; linkedBucks: number; adgaLinks: number } | null>(null);
  const [photoReport, setPhotoReport] = useState({ copied: 0, failed: [] as string[] });
  const counts = useMemo(() => (file ? countOf(file) : null), [file]);
  const demo = herdInfo?.active === "demo";
  const owner = me?.role === "owner";

  async function pick(f: File | undefined) {
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (j?.format !== "easykeeper-herd" || !Array.isArray(j.animals)) throw new Error("This isn't a file made by the EasyKeeper → Herd Manager bookmark.");
      setFile(j); setFileName(f.name); setPhase("idle"); setReport(ZERO); setFinish(null);
    } catch (e: any) {
      toast({ title: "Can't use that file", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  async function run() {
    if (!file) return;
    const parts = chunks(file.animals);
    const allEkIds = file.animals.map((a) => String(a.ekId));
    const idMap: Record<string, number> = {};
    const total: Report = { ...ZERO, skipped: [] };
    setPhase("records");
    try {
      for (let i = 0; i < parts.length; i++) {
        setProg({ n: i, of: parts.length, label: `Goats ${parts.slice(0, i).flat().length + 1}–${parts.slice(0, i + 1).flat().length} of ${file.animals.length}: ${parts[i].map((a) => a.list?.name).filter(Boolean).slice(0, 3).join(", ")}…` });
        let tries = 0;
        for (;;) {
          try {
            const r = await (await apiRequest("POST", "/api/import/easykeeper/chunk", { animals: parts[i], allEkIds, overwrite })).json();
            Object.assign(idMap, r.idMap);
            for (const k of Object.keys(ZERO) as (keyof Report)[]) if (k !== "skipped") (total as any)[k] += r.report[k] ?? 0;
            total.skipped.push(...(r.report.skipped ?? []));
            setReport({ ...total, skipped: [...total.skipped] });
            break;
          } catch (e: any) {
            if (++tries >= 3) throw e;
            await new Promise((ok) => setTimeout(ok, 3000 * tries));
          }
        }
      }
      setProg({ n: parts.length, of: parts.length, label: "Linking parents, kids, bucks and ADGA pages…" });
      setFinish(await (await apiRequest("POST", "/api/import/easykeeper/finish", {})).json());

      if (photos) {
        setPhase("photos");
        const done = new Set<string>(await (await apiRequest("GET", "/api/import/easykeeper/photos-done")).json());
        const list = file.animals.flatMap((a) => (a.photos ?? []).map((p: any, i: number) => ({ ...p, first: i === 0, animalId: idMap[String(a.ekId)], goat: a.list?.name })))
          .filter((p) => p.animalId && p.url && !done.has(String(p.id || p.url)));
        const pr = { copied: 0, failed: [] as string[] };
        const batch: string[] = [];
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          setProg({ n: i, of: list.length, label: `Photo ${i + 1} of ${list.length} (${p.goat})` });
          try {
            let res = await fetch(`${API_BASE}/api/import/easykeeper/photo?url=${encodeURIComponent(p.url)}`);
            if (res.status === 413 && p.thumb) res = await fetch(`${API_BASE}/api/import/easykeeper/photo?url=${encodeURIComponent(p.thumb)}`);
            if (!res.ok) throw new Error(`${res.status}`);
            const blob = await res.blob();
            const f = new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" });
            const [full, thumb, mini] = await Promise.all([resize(f, 1600, 0.82), resize(f, 480, 0.78, true), resize(f, 96, 0.7, true)]);
            const caption = String(p.title || "").replace(/\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*/, " ").trim() || null;
            await apiRequest("POST", `/api/animals/${p.animalId}/photos`, { full, thumb, mini, caption, date: dateFromTitle(p.title) ?? undefined, makeProfile: p.first });
            pr.copied++; batch.push(String(p.id || p.url));
          } catch (e: any) { pr.failed.push(`${p.goat}: ${p.url}`); }
          if (batch.length >= 10 || i === list.length - 1) { if (batch.length) await apiRequest("POST", "/api/import/easykeeper/photos-done", { ids: batch.splice(0) }); }
          setPhotoReport({ ...pr, failed: [...pr.failed] });
        }
      }
      setPhase("done");
      queryClient.invalidateQueries();
      toast({ title: "EasyKeeper import finished", description: `${total.created + total.updated} goats and their records are in Herd Manager.` });
    } catch (e: any) {
      setPhase("idle");
      toast({ title: "Import stopped", description: `${e?.message ?? e}. Nothing is doubled if you run it again — it picks up where it left off.`, variant: "destructive" });
      queryClient.invalidateQueries();
    }
  }

  function downloadReport() {
    const lines = [
      `EasyKeeper import report — ${new Date().toLocaleString()}`,
      `File: ${fileName} (read from EasyKeeper ${file?.readAt?.slice(0, 10) ?? ""})`,
      "",
      `Goats added: ${report.created}`, `Goats matched to ones already here (blanks filled in): ${report.updated}`,
      `Treatments: ${report.treatments}`, `Care records (hoof trims, maintenance, tests, scores): ${report.care}`, `Weights: ${report.weights}`,
      `Reminders: ${report.reminders}`, `Breedings / kiddings: ${report.breedings}`, `Heats: ${report.heats}`, `Notes (incl. status history): ${report.notes}`, `Lactations: ${report.lactations}`,
      finish ? `Parents tidied: ${finish.tidied} · Breedings linked to a herd buck: ${finish.linkedBucks} · ADGA links added: ${finish.adgaLinks}` : "",
      `Photos copied: ${photoReport.copied}`,
      "",
      report.skipped.length ? "Goats that could not be brought over (check these by hand):" : "Every goat in the file came over.",
      ...report.skipped.map((s) => `  • ${s}`),
      photoReport.failed.length ? "\nPhotos that could not be copied:" : "",
      ...photoReport.failed.map((s) => `  • ${s}`),
    ].filter((l) => l !== undefined);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    a.download = `easykeeper-import-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
  }

  const busy = phase === "records" || phase === "photos";
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4" data-testid="card-easykeeper-import">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold"><FileUp className="h-4 w-4 text-primary" />Upload your EasyKeeper file</h2>
        <p className="text-sm text-muted-foreground">Choose the <b>easykeeper-herd-….json</b> file the bookmark saved to your Downloads folder.</p>
      </div>
      {!owner && <p className="rounded-md bg-muted p-3 text-sm">Only the herd owner can import records.</p>}
      {demo && <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">The demo herd is showing. Switch to your own herd on <Link href="/data" className="underline">Import &amp; export</Link> first, so your goats go into your herd and not the demo.</p>}
      <input type="file" accept=".json,application/json" disabled={busy || !owner || demo} onChange={(e) => pick(e.target.files?.[0])}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground" data-testid="input-ek-file" />
      {file && counts && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[["Goats", file.animals.length + (file.totalGoats > file.animals.length ? ` of ${file.totalGoats}` : "")], ["Health records", counts.health], ["Reminders", counts.reminders], ["Breeding & kidding", counts.breed], ["Notes", counts.notes], ["Photos", counts.photos], ["Progeny listed", counts.progeny], ["Read on", new Date(file.readAt).toLocaleDateString()]].map(([l, v]) => (
              <div key={String(l)} className="rounded-md border p-2"><div className="text-xs text-muted-foreground">{l}</div><div className="font-semibold tabular-nums">{String(v)}</div></div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Status in EasyKeeper: {Object.entries(counts.status).map(([k, v]) => `${k} ${v}`).join(" · ")}. Sold and deceased goats come over as Sold / Deceased so every kid shows on its parents' Progeny tab.</p>
          {file.totalGoats > file.animals.length && <p className="flex gap-2 rounded-md bg-amber-100 p-2 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100"><AlertTriangle className="h-4 w-4 shrink-0" />The reader stopped before it finished. You can import these now and the rest later — go back to EasyKeeper, click the bookmark, Continue, and save the file again.</p>}
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={photos} onCheckedChange={(v) => setPhotos(!!v)} disabled={busy} data-testid="check-ek-photos" /><span>Copy the photos too ({counts.photos}). The first photo becomes the profile picture.</span></label>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(!!v)} disabled={busy} data-testid="check-ek-overwrite" /><span>For goats already in Herd Manager, replace their details with EasyKeeper's. (Off: only empty fields are filled in.)</span></label>
          <Button onClick={run} disabled={busy || !owner || demo} data-testid="button-ek-import">{busy ? <Loader2 className="animate-spin" /> : <FileUp />}{phase === "done" ? "Import again (nothing doubles)" : "Bring everything into Herd Manager"}</Button>
        </div>
      )}
      {busy && (
        <div className="space-y-1" data-testid="ek-progress">
          <Progress value={(100 * prog.n) / Math.max(1, prog.of)} />
          <p className="text-xs text-muted-foreground">{phase === "photos" ? <Images className="mr-1 inline h-3.5 w-3.5" /> : null}{prog.label} Keep this page open.</p>
        </div>
      )}
      {(phase === "done" || report.created + report.updated > 0) && (
        <div className="space-y-2 rounded-md border p-3 text-sm" data-testid="ek-report">
          <p className="flex items-center gap-2 font-semibold">{phase === "done" ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Loader2 className="h-4 w-4 animate-spin" />}{report.created} goats added, {report.updated} matched to goats already here</p>
          <p className="text-muted-foreground">{report.treatments} treatments · {report.care} care records · {report.weights} weights · {report.reminders} reminders · {report.breedings} breedings · {report.heats} heats · {report.notes} notes · {report.lactations} lactations{photos ? ` · ${photoReport.copied} photos` : ""}</p>
          {finish && <p className="text-muted-foreground">{finish.tidied} parent names tidied · {finish.linkedBucks} breedings linked to herd bucks · {finish.adgaLinks} ADGA links added</p>}
          {report.skipped.length > 0 && <p className="text-destructive">{report.skipped.length} goats couldn't be brought over — see the report.</p>}
          {photoReport.failed.length > 0 && <p className="text-destructive">{photoReport.failed.length} photos couldn't be copied — see the report.</p>}
          <Button variant="outline" size="sm" onClick={downloadReport} data-testid="button-ek-report"><Download />Download the import report</Button>
        </div>
      )}
    </div>
  );
}

export function CopyReaderButton() {
  const { toast } = useToast();
  return (
    <Button variant="outline" size="sm" data-testid="button-ek-copy" onClick={async () => {
      try {
        const code = await (await fetch(`${API_BASE}/easykeeper-reader.js`)).text();
        await navigator.clipboard.writeText(code);
        toast({ title: "Reader copied", description: "Paste it into the Console on your EasyKeeper tab and press Enter." });
      } catch { toast({ title: "Couldn't copy", description: "Use the bookmark instead.", variant: "destructive" }); }
    }}><Copy />Copy the reader instead</Button>
  );
}
