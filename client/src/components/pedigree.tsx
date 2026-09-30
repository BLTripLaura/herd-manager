import { useEffect, useState } from "react";
import { Link } from "wouter";
import { GitFork, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PedigreeLink } from "@/components/forms";
import { useSave, shortName, type Animal, goatName, regName } from "@/lib/herd";
import { findParent } from "@shared/breed";

/* Three-generation pedigree laid out like the ADGA pedigree: the goat on the left, sire on top, dam below,
   then grandparents and great-grandparents. Ancestors in the herd come from their own records (and link to them);
   anyone else can be typed in and is kept on this goat. */

type Entry = { name?: string; reg?: string; extra?: string };
type Node = { path: string; name: string | null; reg: string | null; detail: string | null; animal: Animal | null; extra?: string | null };
const PATHS = ["S", "D", "SS", "SD", "DS", "DD", "SSS", "SSD", "SDS", "SDD", "DSS", "DSD", "DDS", "DDD"];
const LABEL = (p: string) => {
  const w = p.split("").map((c) => (c === "S" ? "sire" : "dam"));
  if (p.length === 1) return w[0] === "sire" ? "Sire" : "Dam";
  const last = w.pop()!;
  return `${w.join("'s ").replace(/^./, (c) => c.toUpperCase())}'s ${last}`;
};
const parseStore = (s?: string | null): Record<string, Entry> => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };

export function buildPedigree(a: Animal, all: Animal[]): Record<string, Node> {
  const store = parseStore(a.pedigree);
  const out: Record<string, Node> = {};
  // Typed-in entries can live on this goat or on any herd ancestor (paths relative to that ancestor)
  type Src = { store: Record<string, Entry>; at: string };
  const walk = (path: string, text: string | null | undefined, srcs: Src[]) => {
    const own = srcs.map((x) => x.store[path.slice(x.at.length)]).find((e) => e?.name || e?.reg) ?? {};
    const g = findParent(text || own.name, all.filter((x) => x.id !== a.id)) ?? null;
    const name = g ? g.name : text || own.name || null;
    out[path] = { path, name, reg: g?.regNumber || own.reg || null, detail: g ? [g.breed, g.herdbook].filter(Boolean).join(" · ") : null, animal: g, extra: own.extra || null };
    if (path.length < 3) {
      const next = g ? [{ store: parseStore(g.pedigree), at: path }, ...srcs] : srcs;
      walk(path + "S", g?.sire ?? null, next);
      walk(path + "D", g?.dam ?? null, next);
    }
  };
  walk("S", a.sire, [{ store, at: "" }]);
  walk("D", a.dam, [{ store, at: "" }]);
  return out;
}

function Box({ n, sub }: { n: Node; sub?: string }) {
  const title = n.animal ? (n.animal.barnName ? `${n.animal.barnName}` : goatName(n.animal)) : n.name;
  return (
    <div className={`flex h-full min-w-0 flex-col justify-center rounded-md border px-2 py-1.5 ${n.path[n.path.length - 1] === "S" ? "border-l-4 border-l-sky-600/70" : "border-l-4 border-l-pink-500/70"} ${n.name ? "bg-card" : "bg-muted/40"}`} data-testid={`ped-${n.path}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{sub ?? LABEL(n.path)}</div>
      {n.name ? (
        <>
          {n.animal
            ? <Link href={`/animal/${n.animal.id}`} className="break-words text-xs font-semibold leading-tight text-primary hover:underline sm:text-sm">{title}</Link>
            : <div className="break-words text-xs font-semibold leading-tight sm:text-sm">{title}</div>}
          {n.animal?.barnName && <div className="break-words text-[11px] leading-tight text-muted-foreground">{n.animal.name}</div>}
          {n.reg && <div className="text-[11px] tabular-nums text-muted-foreground">{n.reg}</div>}
          {n.extra && <div className="text-[11px] text-muted-foreground">{n.extra}</div>}
          {n.detail && <div className="hidden text-[11px] text-muted-foreground sm:block">{n.detail}</div>}
        </>
      ) : <div className="text-xs text-muted-foreground">Unknown</div>}
    </div>
  );
}

export function PedigreeChart({ animal, animals }: { animal: Animal; animals: Animal[] }) {
  const [editing, setEditing] = useState(false);
  const ped = buildPedigree(animal, animals);
  const known = PATHS.filter((p) => ped[p]?.name).length;
  // 8 rows: great-grandparents one row each, grandparents 2, parents 4
  const row = (i: number, span: number) => ({ gridRow: `${i * span + 1} / span ${span}` });
  return (
    <section className="mt-8" data-testid="section-pedigree">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold"><GitFork className="h-4 w-4 rotate-90 text-primary" />Pedigree</h2>
        <div className="flex items-center gap-3">
          <PedigreeLink url={animal.pedigreeUrl} />
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="button-edit-pedigree"><Pencil />Edit</Button>
        </div>
      </div>
      <div className="grid grid-cols-[0.9fr_1fr_1fr_1.1fr] gap-1.5 overflow-hidden rounded-lg border bg-muted/20 p-1.5 sm:gap-2 sm:p-2" style={{ gridTemplateRows: "repeat(8, minmax(2.75rem, auto))" }}>
        <div style={{ gridColumn: 1, gridRow: "1 / span 8" }} className="flex flex-col justify-center rounded-md border-2 border-primary/50 bg-card px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{animal.sex}</div>
          <div className="break-words text-xs font-bold leading-tight sm:text-sm">{goatName(animal)}</div>
          {animal.barnName && <div className="break-words text-[11px] leading-tight text-muted-foreground">{animal.name}</div>}
          {animal.regNumber && <div className="text-[11px] tabular-nums text-muted-foreground">{animal.regNumber}</div>}
          <div className="text-[11px] text-muted-foreground">{[animal.breed, animal.herdbook].filter(Boolean).join(" · ")}</div>
        </div>
        {["S", "D"].map((p, i) => <div key={p} style={{ gridColumn: 2, ...row(i, 4) }}><Box n={ped[p]} /></div>)}
        {["SS", "SD", "DS", "DD"].map((p, i) => <div key={p} style={{ gridColumn: 3, ...row(i, 2) }}><Box n={ped[p]} sub={LABEL(p).replace(/^(Sire|Dam)'s /, (m) => m)} /></div>)}
        {["SSS", "SSD", "SDS", "SDD", "DSS", "DSD", "DDS", "DDD"].map((p, i) => <div key={p} style={{ gridColumn: 4, ...row(i, 1) }}><Box n={ped[p]} /></div>)}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {known === 0 ? "No ancestors on file yet. Tap Edit to type them in from the ADGA pedigree." : "Ancestors in your herd are filled in from their own records and open their profile."}
      </p>
      <PedigreeDialog open={editing} onOpenChange={setEditing} animal={animal} animals={animals} />
    </section>
  );
}

function PedigreeDialog({ open, onOpenChange, animal, animals }: { open: boolean; onOpenChange: (o: boolean) => void; animal: Animal; animals: Animal[] }) {
  const save = useSave("animals");
  const { toast } = useToast();
  const [v, setV] = useState<Record<string, Entry>>({});
  const [url, setUrl] = useState("");
  const ped = buildPedigree(animal, animals);
  useEffect(() => {
    if (!open) return;
    const st = parseStore(animal.pedigree);
    const init: Record<string, Entry> = {};
    for (const p of PATHS) init[p] = { name: p === "S" ? animal.sire ?? "" : p === "D" ? animal.dam ?? "" : st[p]?.name ?? "", reg: st[p]?.reg ?? "", extra: st[p]?.extra };
    setV(init); setUrl(animal.pedigreeUrl ?? "");
  }, [open]); // eslint-disable-line
  const submit = async () => {
    const store: Record<string, Entry> = {};
    for (const p of PATHS) { const e = v[p]; if (e?.name?.trim() || e?.reg?.trim()) store[p] = { name: e.name?.trim() || undefined, reg: e.reg?.trim().toUpperCase() || undefined, extra: e.extra || undefined }; }
    await save.mutateAsync({ id: animal.id, sire: v.S?.name?.trim() || null, dam: v.D?.name?.trim() || null, pedigree: Object.keys(store).length ? JSON.stringify(store) : null, pedigreeUrl: url.trim() || null } as any);
    toast({ title: "Pedigree saved", description: goatName(animal) });
    onOpenChange(false);
  };
  // A position comes from the herd when its child is a herd goat; those are shown, not typed
  const fromHerd = (p: string) => p.length > 1 && !!ped[p.slice(0, -1)]?.animal;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit pedigree</DialogTitle>
          <DialogDescription>Type names and reg numbers from the ADGA pedigree. Goats already in your herd fill in their own parents.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">ADGA pedigree link</div>
            <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" data-testid="input-ped-url" />
          </div>
          {PATHS.map((p) => (
            <div key={p} className={p.length === 1 ? "" : p.length === 2 ? "pl-3" : "pl-6"}>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">{LABEL(p)}</div>
              {fromHerd(p) ? (
                <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">{ped[p]?.name ? `${ped[p].name}${ped[p].reg ? ` · ${ped[p].reg}` : ""}` : "Not set"} · from {ped[p.slice(0, -1)].animal!.barnName || shortName(ped[p.slice(0, -1)].animal!.name)}'s record</div>
              ) : (
                <div className="grid grid-cols-[1fr_8rem] gap-2">
                  <Input list={p.endsWith("S") ? "ped-sires" : "ped-dams"} value={v[p]?.name ?? ""} onChange={(e) => setV({ ...v, [p]: { ...v[p], name: e.target.value } })} placeholder="Name" data-testid={`input-ped-${p}`} />
                  <Input value={v[p]?.reg ?? ""} onChange={(e) => setV({ ...v, [p]: { ...v[p], reg: e.target.value } })} placeholder="Reg #" data-testid={`input-ped-reg-${p}`} />
                </div>
              )}
            </div>
          ))}
          <datalist id="ped-sires">{animals.filter((x) => x.sex === "buck").map((x) => <option key={x.id} value={x.name}>{x.barnName ?? ""}</option>)}</datalist>
          <datalist id="ped-dams">{animals.filter((x) => x.sex === "doe").map((x) => <option key={x.id} value={x.name}>{x.barnName ?? ""}</option>)}</datalist>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending} data-testid="button-save-pedigree">Save pedigree</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
