import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FileText, ScanLine, Loader2, Trash2, Download, ZoomIn, ZoomOut, ImagePlus, X, AlertTriangle, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDate, shortName, type Animal, goatName, regName } from "@/lib/herd";
import { resize } from "@/components/photos";

type Paper = { id: number; animalId: number; date: string; label: string | null; thumb: string };
type Entry = { name?: string | null; reg?: string | null; extra?: string | null };
type Scan = {
  fields: Record<string, any> & { ancestors: Record<string, Entry>; fourthGeneration: string[]; unclear: string[] };
  match: { id: number; name: string; why: string } | null;
  linked: Record<string, { id: number; name: string } | null>;
};

const papersKey = (id: number) => [`/api/animals/${id}/papers`];
const usePapers = (id: number) => useQuery<Paper[]>({ queryKey: papersKey(id) });
const PATHS = ["S", "D", "SS", "SD", "DS", "DD", "SSS", "SSD", "SDS", "SDD", "DSS", "DSD", "DDS", "DDD"];
const LABEL = (p: string) => {
  const w = p.split("").map((c) => (c === "S" ? "sire" : "dam"));
  if (p.length === 1) return w[0] === "sire" ? "Sire" : "Dam";
  const last = w.pop()!;
  return `${w.join("'s ").replace(/^./, (c) => c.toUpperCase())}'s ${last}`;
};

/* Fields the scan can fill, in the order they appear on the review screen */
const CHOICES: Record<string, string[]> = {
  sex: ["doe", "buck", "wether"], herdbook: ["Purebred", "American", "Experimental", "Grade"],
  hornStatus: ["disbudded", "polled", "horned", "scurs"], tattooLocation: ["ear", "tail"],
};
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const FIELDS: { key: string; label: string; show?: (v: any) => string }[] = [
  { key: "name", label: "Registered name" },
  { key: "regNumber", label: "Registration #" },
  { key: "breed", label: "Breed" },
  { key: "herdbook", label: "Herdbook" },
  { key: "sex", label: "Sex" },
  { key: "dob", label: "Birth date", show: fmtDate },
  { key: "color", label: "Color" },
  { key: "eyeColor", label: "Eye color" },
  { key: "earType", label: "Ear type" },
  { key: "hornStatus", label: "Horns" },
  { key: "tattooRight", label: "Tattoo right / tail 1" },
  { key: "tattooLeft", label: "Tattoo left / tail 2" },
  { key: "tattooLocation", label: "Tattoo location" },
  { key: "microchip", label: "Microchip" },
];

function refresh(id?: number) {
  queryClient.invalidateQueries({ queryKey: ["/api/animals"] });
  if (id) queryClient.invalidateQueries({ queryKey: papersKey(id) });
}

/** Registration papers card on the profile: the stored certificate photos, plus the scan button */
export function RegistrationPapers({ animal }: { animal: Animal }) {
  const { data: papers = [], isLoading } = usePapers(animal.id);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [scan, setScan] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, 4);
    if (!list.length) return;
    setBusy(true);
    try {
      for (let i = 0; i < list.length; i++) {
        const [full, thumb] = await Promise.all([resize(list[i], 2400, 0.86), resize(list[i], 480, 0.78)]);
        await apiRequest("POST", `/api/animals/${animal.id}/papers`, { full, thumb, label: papers.length + i === 0 ? "Front" : null });
      }
      toast({ title: list.length === 1 ? "Paper photo saved" : `${list.length} paper photos saved`, description: goatName(animal) });
    } catch { toast({ title: "Couldn't save that photo", description: "Try a JPEG or PNG photo.", variant: "destructive" }); }
    setBusy(false); if (inputRef.current) inputRef.current.value = ""; refresh(animal.id);
  };
  return (
    <div className="rounded-lg border bg-card" data-testid="card-papers">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold"><FileText className="h-4 w-4 text-primary" />Registration papers{papers.length ? <span className="font-normal text-muted-foreground">({papers.length})</span> : null}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <label className="cursor-pointer" data-testid="button-add-paper">
              {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}{busy ? "Saving…" : "Add photo"}
              <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => add(e.target.files)} data-testid="input-add-paper" />
            </label>
          </Button>
          <Button size="sm" onClick={() => setScan(true)} data-testid="button-scan-papers"><ScanLine />Scan papers</Button>
        </div>
      </div>
      {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading…</div> : papers.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-muted-foreground">No papers on file. Scan papers reads the certificate, fills in this profile and the pedigree, and keeps the photo here.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-6">
          {papers.map((p) => (
            <li key={p.id}>
              <button onClick={() => setOpenId(p.id)} className="group block w-full overflow-hidden rounded-md border bg-muted text-left" data-testid={`button-paper-${p.id}`}>
                <img src={p.thumb} alt={p.label || "Registration paper"} loading="lazy" className="aspect-[3/4] w-full object-cover object-top transition-transform group-hover:scale-105" />
                <div className="truncate px-1.5 py-1 text-[11px] text-muted-foreground">{p.label || "Paper"} · {fmtDate(p.date)}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <PaperViewer animal={animal} papers={papers} openId={openId} setOpenId={setOpenId} />
      <ScanPapersDialog open={scan} onOpenChange={setScan} animal={animal} />
    </div>
  );
}

function PaperViewer({ animal, papers, openId, setOpenId }: { animal: Animal; papers: Paper[]; openId: number | null; setOpenId: (id: number | null) => void }) {
  const { toast } = useToast();
  const p = papers.find((x) => x.id === openId) ?? null;
  const [zoom, setZoom] = useState(false);
  const [label, setLabel] = useState("");
  const [confirm, setConfirm] = useState(false);
  const full = useQuery<{ full: string }>({ queryKey: [`/api/papers/${p?.id}`], enabled: !!p, staleTime: Infinity });
  useEffect(() => { setLabel(p?.label ?? ""); setZoom(false); }, [p?.id]); // eslint-disable-line
  const saveLabel = async () => { if (p && label !== (p.label ?? "")) { await apiRequest("PATCH", `/api/papers/${p.id}`, { label }); refresh(animal.id); } };
  const remove = async () => {
    if (!p) return;
    await apiRequest("DELETE", `/api/papers/${p.id}`); refresh(animal.id);
    setConfirm(false); setOpenId(null); toast({ title: "Paper photo deleted" });
  };
  const fileName = `${(animal.barnName || animal.name).replace(/[^\w-]+/g, "-")}-papers${p?.label ? "-" + p.label.replace(/[^\w-]+/g, "-") : ""}.jpg`;
  return (
    <>
      <Dialog open={!!p} onOpenChange={(o) => { if (!o) { saveLabel(); setOpenId(null); } }}>
        <DialogContent className="max-h-[95dvh] w-[calc(100vw-1rem)] grid-cols-[minmax(0,1fr)] gap-3 overflow-y-auto p-3 sm:max-w-4xl sm:p-4">
          <DialogTitle className="pr-8 text-base">{goatName(animal)} <span className="font-normal text-muted-foreground">· registration papers</span></DialogTitle>
          <DialogDescription className="sr-only">Full size photo of the registration certificate.</DialogDescription>
          <div className={`max-h-[70dvh] overflow-auto rounded-md bg-muted ${zoom ? "" : "flex justify-center"}`} data-testid="paper-scroll">
            <img src={full.data?.full ?? p?.thumb} alt={p?.label || "Registration paper"} onClick={() => setZoom(!zoom)}
              className={zoom ? "max-w-none cursor-zoom-out" : "max-h-[70dvh] w-auto max-w-full cursor-zoom-in object-contain"} style={zoom ? { width: "220%" } : undefined} data-testid="img-paper-full" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={saveLabel} onKeyDown={(e) => e.key === "Enter" && saveLabel()}
              placeholder="Label, e.g. Front, Back, After transfer" className="min-w-0 flex-1 basis-52" data-testid="input-paper-label" />
            <span className="text-xs text-muted-foreground">{p && `Added ${fmtDate(p.date)}`}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setZoom(!zoom)} data-testid="button-paper-zoom">{zoom ? <ZoomOut /> : <ZoomIn />}{zoom ? "Fit" : "Zoom"}</Button>
              {full.data?.full && <Button variant="outline" size="sm" asChild><a href={full.data.full} download={fileName} data-testid="link-paper-download"><Download />Save to device</a></Button>}
            </div>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm(true)} data-testid="button-delete-paper"><Trash2 />Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this paper photo?</AlertDialogTitle><AlertDialogDescription>The photo is removed from {goatName(animal)}'s profile. The details already filled in stay. This can't be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove} data-testid="button-confirm-delete-paper">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Scan papers: photo → AI reads it → review everything → save to an existing goat or a new one */
export function ScanPapersDialog({ open, onOpenChange, animal }: { open: boolean; onOpenChange: (o: boolean) => void; animal?: Animal }) {
  const { toast } = useToast();
  const [, nav] = useLocation();
  const { data: animals = [] } = useQuery<Animal[]>({ queryKey: ["/api/animals"] });
  const [shots, setShots] = useState<{ full: string; thumb: string; label: string }[]>([]);
  const [step, setStep] = useState<"pick" | "reading" | "review">("pick");
  const [scan, setScan] = useState<Scan | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [use, setUse] = useState<Record<string, boolean>>({});
  const [anc, setAnc] = useState<Record<string, Entry>>({});
  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState<number | "new">("new");
  const [keepPhoto, setKeepPhoto] = useState(true);
  const [usePed, setUsePed] = useState(true);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setShots([]); setStep("pick"); setScan(null); setSaving(false); setKeepPhoto(true); setUsePed(true); } }, [open]);

  const cur = target === "new" ? null : animals.find((a) => a.id === target) ?? null;
  // Fields that differ from what the goat has now start unticked, so nothing gets replaced by surprise
  useEffect(() => {
    if (!scan) return;
    const u: Record<string, boolean> = {};
    for (const f of FIELDS) {
      const now = (cur as any)?.[f.key];
      u[f.key] = !!vals[f.key] && (!now || String(now).toLowerCase() === String(vals[f.key]).toLowerCase() || !cur);
    }
    setUse(u);
  }, [target, scan]); // eslint-disable-line

  const addShots = async (files: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, 2 - shots.length);
    const next: { full: string; thumb: string; label: string }[] = [];
    for (const f of list) {
      try { const [full, thumb] = await Promise.all([resize(f, 2400, 0.86), resize(f, 480, 0.78)]); next.push({ full, thumb, label: shots.length + next.length === 0 ? "Front" : "Back" }); }
      catch { toast({ title: `Couldn't open ${f.name}`, description: "Try a JPEG or PNG photo.", variant: "destructive" }); }
    }
    setShots((s) => [...s, ...next]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const read = async () => {
    setStep("reading");
    try {
      const res = await apiRequest("POST", "/api/papers/scan", { images: shots.map((s) => s.full) });
      const r: Scan = await res.json();
      const f = r.fields;
      const v: Record<string, string> = {};
      for (const x of FIELDS) v[x.key] = f[x.key] ? String(f[x.key]) : "";
      setVals(v); setAnc(f.ancestors ?? {});
      const note = [
        `From ${f.registry || "registration"} papers${f.regNumber ? ` (${f.regNumber})` : ""}:`,
        f.breeder && `Bred by ${f.breeder}.`,
        f.owner && `Owned by ${f.owner}${f.ownerDate ? ` since ${fmtDate(f.ownerDate)}` : ""}.`,
        f.fourthGeneration?.length ? `4th generation: ${f.fourthGeneration.join("; ")}.` : null,
        // Only extra facts the rest of the screen doesn't already cover
        ...String(f.other ?? "").split(/;\s*|\.\s+/).map((x: string) => x.trim()).filter((x: string) => x && !/tattoo|bred|breeder|owner|issue|member|location|sire|dam|registration|\bid\b/i.test(x)).map((x: string) => x.replace(/\.?$/, ".")),
      ].filter(Boolean).join(" ");
      setNotes(note.includes("Bred by") || note.includes("Owned by") || f.fourthGeneration?.length || f.other ? note : "");
      setTarget(animal ? animal.id : r.match ? r.match.id : "new");
      setScan(r); setStep("review");
    } catch (e: any) {
      toast({ title: "Couldn't read the papers", description: String(e?.message ?? "").replace(/^\d+:\s*/, "").replace(/^\{"message":"|"\}$/g, "") || "Try a clearer photo.", variant: "destructive" });
      setStep("pick");
    }
  };

  const save = async () => {
    if (!scan) return;
    setSaving(true);
    try {
      const data: Record<string, string> = {};
      for (const f of FIELDS) if (use[f.key] && vals[f.key]?.trim()) data[f.key] = vals[f.key].trim();
      // Parents: link to herd goats found by reg #, otherwise keep the name from the papers
      const s = scan.linked.S?.name || anc.S?.name, d = scan.linked.D?.name || anc.D?.name;
      if (usePed && s) data.sire = s;
      if (usePed && d) data.dam = d;
      if (target === "new" && !data.name) { toast({ title: "Add the registered name first", variant: "destructive" }); setSaving(false); return; }
      const res = await apiRequest("POST", "/api/papers/apply", {
        animalId: target === "new" ? null : target, data, ancestors: usePed ? anc : {}, notes,
        images: keepPhoto ? shots.map((x) => ({ full: x.full, thumb: x.thumb, label: x.label })) : [],
      });
      const r = await res.json();
      refresh(r.id);
      toast({ title: r.created ? "Goat added from papers" : "Profile updated from papers", description: [data.name || cur?.name, keepPhoto && r.papers ? "paper photo kept on the profile" : null].filter(Boolean).join(" · ") });
      onOpenChange(false);
      if (!animal || animal.id !== r.id) nav(`/animal/${r.id}`);
    } catch (e: any) {
      toast({ title: "Couldn't save", description: String(e?.message ?? ""), variant: "destructive" });
    }
    setSaving(false);
  };

  const unclear = new Set((scan?.fields.unclear ?? []).map((x) => x.toLowerCase()));
  const options = useMemo(() => [...animals].sort((a, b) => a.name.localeCompare(b.name)), [animals]);

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scan registration papers</DialogTitle>
          <DialogDescription>
            {step === "review" ? "Check everything against the paper. Only ticked details are saved." : "Take a photo of the certificate, flat and in good light. Add the back too if something is printed there."}
          </DialogDescription>
        </DialogHeader>

        {step !== "review" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {shots.map((s, i) => (
                <div key={i} className="relative overflow-hidden rounded-md border bg-muted">
                  <img src={s.thumb} alt={s.label} className="aspect-[3/4] w-full object-cover object-top" />
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-xs font-semibold text-white">{s.label}</div>
                  {step === "pick" && <button onClick={() => setShots(shots.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white" aria-label="Remove photo" data-testid={`button-remove-shot-${i}`}><X className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
              {shots.length < 2 && step === "pick" && (
                <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/40 bg-primary/5 text-center text-primary hover:bg-primary/10" data-testid="button-pick-paper">
                  <ScanLine className="h-6 w-6" />
                  <span className="px-2 text-sm font-semibold">{shots.length ? "Add the back (optional)" : "Take or choose a photo"}</span>
                  <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={(e) => addShots(e.target.files)} data-testid="input-scan-paper" />
                </label>
              )}
            </div>
            {step === "reading" && <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm"><Loader2 className="h-4 w-4 animate-spin text-primary" />Reading the papers. This takes about 20 seconds.</div>}
          </div>
        )}

        {step === "review" && scan && (
          <div className="space-y-5">
            {scan.fields.confidence === "low" && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />Parts of the photo were hard to read. Check the tattoo and reg numbers closely.</div>
            )}
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Save to</div>
              {animal ? (
                <div className="rounded-md border px-3 py-2 text-sm font-semibold">{goatName(animal)}{scan.match && scan.match.id !== animal.id && <span className="block text-xs font-normal text-amber-700">These papers look like they belong to {scan.match.name} ({scan.match.why}). Check before saving.</span>}</div>
              ) : (
                <>
                  <select value={String(target)} onChange={(e) => setTarget(e.target.value === "new" ? "new" : Number(e.target.value))} className="h-9 w-full rounded-md border bg-background px-2 text-sm" data-testid="select-scan-target">
                    <option value="new">Add as a new goat</option>
                    {options.map((a) => <option key={a.id} value={a.id}>{goatName(a)}{regName(a) ? ` (${regName(a)})` : ""}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">{scan.match ? `Found in your herd: ${scan.match.name}, ${scan.match.why}.` : "No goat in your herd has this name, registration # or tattoo."}</p>
                </>
              )}
            </div>

            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Details</div>
              <div className="divide-y rounded-md border">
                {FIELDS.map((f) => {
                  const now = (cur as any)?.[f.key];
                  const differs = !!cur && !!now && !!vals[f.key] && String(now).toLowerCase() !== vals[f.key].toLowerCase();
                  const doubt = unclear.has(f.key.toLowerCase());
                  return (
                    <div key={f.key} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 px-3 py-2 sm:grid-cols-[auto_9rem_minmax(0,1fr)]">
                      <Checkbox checked={!!use[f.key]} onCheckedChange={(c) => setUse({ ...use, [f.key]: !!c })} className="mt-2.5" aria-label={`Save ${f.label}`} data-testid={`check-scan-${f.key}`} />
                      <div className="pt-2 text-xs font-semibold text-muted-foreground">{f.label}{doubt && <span className="ml-1 text-amber-700">· check</span>}</div>
                      <div className="col-start-2 sm:col-start-3">
                        {CHOICES[f.key] ? (
                          <select value={vals[f.key] ?? ""} onChange={(e) => { setVals({ ...vals, [f.key]: e.target.value }); setUse({ ...use, [f.key]: !!e.target.value }); }} className={`h-9 w-full rounded-md border bg-background px-2 text-sm ${doubt ? "border-amber-500" : ""}`} data-testid={`input-scan-${f.key}`}>
                            <option value="">Not on the paper</option>
                            {[...CHOICES[f.key], ...(vals[f.key] && !CHOICES[f.key].includes(vals[f.key]) ? [vals[f.key]] : [])].map((o) => <option key={o} value={o}>{cap(o)}</option>)}
                          </select>
                        ) : (
                          <Input type={f.key === "dob" ? "date" : "text"} value={vals[f.key] ?? ""} onChange={(e) => { setVals({ ...vals, [f.key]: e.target.value }); if (e.target.value) setUse({ ...use, [f.key]: true }); }} className={`h-9 ${doubt ? "border-amber-500" : ""}`} placeholder={f.key === "microchip" ? "None yet, leave blank" : "Not on the paper"} data-testid={`input-scan-${f.key}`} />
                        )}
                        {differs && <p className="mt-0.5 text-xs text-amber-700">Now: {f.show ? f.show(now) : cap(String(now))}. Tick to replace it.</p>}
                        {cur && !differs && now && vals[f.key] && <p className="mt-0.5 text-xs text-muted-foreground">Matches the profile.</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Checkbox checked={usePed} onCheckedChange={(c) => setUsePed(!!c)} data-testid="check-scan-pedigree" />Pedigree{cur?.sire || cur?.dam ? <span className="font-normal">· now {[cur?.sire && `sire ${cur.sire}`, cur?.dam && `dam ${cur.dam}`].filter(Boolean).join(", ")}</span> : null}</label>
              <div className="space-y-2">
                {PATHS.filter((p) => p.length <= 2 || anc[p]?.name || anc[p]?.reg).map((p) => (
                  <div key={p} className={p.length === 1 ? "" : p.length === 2 ? "pl-3" : "pl-6"}>
                    <div className="mb-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">{LABEL(p)}
                      {p.length === 1 && scan.linked[p] && <span className="flex items-center gap-0.5 text-primary"><Link2 className="h-3 w-3" />in your herd</span>}
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-1.5">
                      <Input value={anc[p]?.name ?? ""} onChange={(e) => setAnc({ ...anc, [p]: { ...anc[p], name: e.target.value } })} className="h-8 text-sm" placeholder="Name" data-testid={`input-scan-ped-${p}`} />
                      <Input value={anc[p]?.reg ?? ""} onChange={(e) => setAnc({ ...anc, [p]: { ...anc[p], reg: e.target.value.toUpperCase() } })} className="h-8 text-sm tabular-nums" placeholder="Reg #" data-testid={`input-scan-reg-${p}`} />
                    </div>
                    {anc[p]?.extra && <div className="mt-0.5 text-[11px] text-muted-foreground">{anc[p]!.extra}</div>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Add to notes</div>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} data-testid="input-scan-notes" />
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={keepPhoto} onCheckedChange={(c) => setKeepPhoto(!!c)} data-testid="check-keep-paper" />Keep the photo in Registration papers</label>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "review" && <Button variant="outline" onClick={() => setStep("pick")} disabled={saving}>Back</Button>}
          {step !== "review"
            ? <Button onClick={read} disabled={!shots.length || step === "reading"} data-testid="button-read-papers">{step === "reading" ? <Loader2 className="animate-spin" /> : <ScanLine />}Read papers</Button>
            : <Button onClick={save} disabled={saving} data-testid="button-save-scan">{saving && <Loader2 className="animate-spin" />}{target === "new" ? "Add goat" : "Save to profile"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Button for the Import page and herd list */
export function ScanPapersButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="button-scan-papers-new"><ScanLine />Scan registration papers</Button>
      <ScanPapersDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
