import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Plus, MoreHorizontal, Pencil, Trash2, CheckSquare, X, AlertTriangle, Trees, Undo2, MoveRight, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, Empty } from "@/components/shell";
import { Field } from "@/components/forms";
import { useList, useSave, useRemove, post, today, fmtShort, shortName, activeHolds, restingDays, type Pasture, type Animal, goatName, regName } from "@/lib/herd";
import { cn } from "@/lib/utils";

type Col = { id: number | null; name: string; pasture?: Pasture };

function PastureDialog({ open, onOpenChange, pasture }: { open: boolean; onOpenChange: (o: boolean) => void; pasture?: Pasture }) {
  const save = useSave("pastures");
  const { toast } = useToast();
  const [name, setName] = useState(""); const [acres, setAcres] = useState(""); const [notes, setNotes] = useState("");
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) { setLastOpen(open); if (open) { setName(pasture?.name ?? ""); setAcres(pasture?.acres != null ? String(pasture.acres) : ""); setNotes(pasture?.notes ?? ""); } }
  const submit = async () => {
    if (!name.trim()) return toast({ title: "Name is required", variant: "destructive" });
    await save.mutateAsync({ id: pasture?.id, name: name.trim(), acres: acres ? Number(acres) : null, notes: notes || null });
    toast({ title: pasture ? "Pasture updated" : "Pasture added", description: name });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{pasture ? "Edit pasture" : "Add pasture"}</DialogTitle><DialogDescription>Paddocks, lots, pens or browse areas.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Name" className="col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Front Pasture" data-testid="input-pasture-name" /></Field>
          <Field label="Acres"><Input type="number" inputMode="decimal" step="any" value={acres} onChange={(e) => setAcres(e.target.value)} data-testid="input-pasture-acres" /></Field>
          <Field label="Notes" className="col-span-3"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending} data-testid="button-save-pasture">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Pastures() {
  const { data: animals, isLoading } = useList("animals");
  const { data: pastures = [] } = useList("pastures");
  const { data: moves = [] } = useList("pastureMoves");
  const { data: treatments = [] } = useList("treatments");
  const removePasture = useRemove("pastures");
  const { toast } = useToast();
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<{ open: boolean; p?: Pasture }>({ open: false });
  const [deleting, setDeleting] = useState<Pasture | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const active = (animals ?? []).filter((a) => a.status === "active");
  const holds = activeHolds(treatments, animals ?? []);
  const sel = new Set(selected);
  const cols: Col[] = useMemo(() => {
    const c: Col[] = [...pastures].sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ id: p.id, name: p.name, pasture: p }));
    if (active.some((a) => !a.pastureId || !pastures.some((p) => p.id === a.pastureId))) c.push({ id: null, name: "Unassigned" });
    return c;
  }, [pastures, active]);
  const inCol = (col: Col) => active
    .filter((a) => (col.id === null ? !a.pastureId || !pastures.some((p) => p.id === a.pastureId) : a.pastureId === col.id))
    .sort((a, b) => (a.tag ?? "").localeCompare(b.tag ?? "", undefined, { numeric: true }));
  const lastIn = (a: Animal) => moves.filter((m) => m.animalId === a.id && m.toPastureId === a.pastureId).sort((x, y) => y.date.localeCompare(x.date))[0];

  const toggle = (id: number) => setSelected(sel.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const moveTo = async (ids: number[], pastureId: number | null) => {
    const name = pastureId === null ? "Unassigned" : pastures.find((p) => p.id === pastureId)?.name ?? "pasture";
    const created: any[] = await post("/api/animals/move", { ids, pastureId, date: today() });
    setSelected([]);
    if (!created.length) return toast({ title: `Already in ${name}` });
    toast({
      title: `Moved ${created.length} to ${name}`,
      description: created.length <= 3 ? created.map((m) => shortName(active.find((a) => a.id === m.animalId)?.name ?? "")).join(", ") : undefined,
      action: <ToastAction altText="Undo move" onClick={() => post("/api/animals/move/undo", { moveIds: created.map((m) => m.id) })} data-testid="button-undo-move"><Undo2 className="mr-1 h-3.5 w-3.5" />Undo</ToastAction>,
    });
  };

  const onDrop = (col: Col, e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    if (!id) return;
    const ids = sel.has(id) ? selected : [id];
    moveTo(ids, col.id);
  };

  const qq = q.trim().toLowerCase();
  const matches = (a: Animal) => !qq || [a.name, a.barnName, a.tag, a.regNumber].filter(Boolean).join(" ").toLowerCase().includes(qq);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)}</div></div>;

  return (
    <>
      <PageHeader title="Pastures" sub="Tap goats to select them, then tap where they're going. On a computer you can also drag them.">
        <Button onClick={() => setEditing({ open: true })} data-testid="button-add-pasture"><Plus />Add pasture</Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a goat…" className="h-10 max-w-xs" data-testid="input-pasture-search" />
        <span className="text-xs text-muted-foreground">{active.length} active goats across {pastures.length} pastures</span>
      </div>

      {pastures.length === 0 && active.length === 0 ? (
        <Empty icon={Trees} title="No pastures yet">Add your pastures, then assign goats to them.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cols.map((col) => {
            const goats = inCol(col);
            const key = String(col.id);
            const rest = col.id !== null ? restingDays(col.id, animals ?? [], moves) : null;
            const allSel = goats.length > 0 && goats.every((g) => sel.has(g.id));
            const perAcre = col.pasture?.acres ? goats.length / col.pasture.acres : null;
            return (
              <section key={key} data-testid={`pasture-${key}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(key); }} onDragLeave={() => setDragOver((d) => (d === key ? null : d))} onDrop={(e) => onDrop(col, e)}
                className={cn("flex flex-col rounded-lg border bg-card transition-colors", dragOver === key && "border-primary ring-2 ring-primary/30", col.id === null && "border-dashed")}>
                <header className="flex items-start justify-between gap-2 border-b px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold" data-testid={`text-pasture-name-${key}`}>{col.name}</h2>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground tabular-nums" data-testid={`text-pasture-count-${key}`}>{goats.length}</span> goat{goats.length === 1 ? "" : "s"}
                      {col.pasture?.acres ? ` · ${col.pasture.acres} ac` : ""}{perAcre ? ` · ${perAcre.toFixed(1)}/ac` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {rest !== null && <Badge variant="secondary" className="text-xs">Resting {rest}d</Badge>}
                    {col.pasture && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Pasture options" data-testid={`button-pasture-menu-${key}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelected(Array.from(new Set([...selected, ...goats.map((g) => g.id)])))} disabled={!goats.length}><CheckSquare className="mr-2 h-4 w-4" />Select everyone here</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditing({ open: true, p: col.pasture })}><Pencil className="mr-2 h-4 w-4" />Edit pasture</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(col.pasture!)}><Trash2 className="mr-2 h-4 w-4" />Delete pasture</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </header>
                {col.pasture?.notes && <p className="border-b px-4 py-2 text-xs text-muted-foreground">{col.pasture.notes}</p>}
                {goats.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground">
                    {selected.length ? <Button variant="outline" size="sm" onClick={() => moveTo(selected, col.id)} data-testid={`button-move-here-${key}`}><MoveRight />Move {selected.length} here</Button> : "Empty. Select goats and move them here."}
                  </div>
                ) : (
                  <ul className="flex-1">
                    {goats.map((g) => {
                      const on = sel.has(g.id);
                      const since = lastIn(g);
                      const dim = qq && !matches(g);
                      return (
                        <li key={g.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(g.id)); e.dataTransfer.effectAllowed = "move"; }}
                          className={cn("group flex items-center gap-2 border-b px-2 last:border-b-0", on && "bg-accent/70", dim && "opacity-30", qq && !dim && "bg-primary/5")}>
                          <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50 md:block" aria-hidden />
                          <button onClick={() => toggle(g.id)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left" aria-pressed={on} data-testid={`button-goat-${g.id}`}>
                            <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px]", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{on ? "✓" : ""}</span>
                            <span className="w-9 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">#{g.tag || "—"}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{goatName(g)}</span>
                              <span className="block truncate text-xs text-muted-foreground"><span className="capitalize">{g.sex}</span>{g.groupName ? ` · ${g.groupName}` : ""}{since ? ` · in since ${fmtShort(since.date)}` : ""}</span>
                            </span>
                            {holds.milk.has(g.id) && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="On milk hold" />}
                          </button>
                          <Link href={`/animal/${g.id}`} className="shrink-0 px-1 text-xs text-muted-foreground hover:text-foreground" data-testid={`link-goat-${g.id}`}>View</Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {goats.length > 0 && (
                  <footer className="flex items-center justify-between border-t px-4 py-2">
                    <button className="text-xs font-medium text-primary" onClick={() => setSelected(allSel ? selected.filter((id) => !goats.some((g) => g.id === id)) : Array.from(new Set([...selected, ...goats.map((g) => g.id)])))} data-testid={`button-select-pasture-${key}`}>
                      {allSel ? "Unselect all" : "Select all"}
                    </button>
                    {selected.length > 0 && !allSel && <Button variant="ghost" size="sm" onClick={() => moveTo(selected, col.id)} data-testid={`button-move-here-${key}`}><MoveRight />Move {selected.length} here</Button>}
                  </footer>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Move bar */}
      {selected.length > 0 && (
        <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-3xl rounded-lg border bg-popover p-3 shadow-lg md:bottom-6 md:left-64" data-testid="bar-move">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold" data-testid="text-move-count">Move {selected.length} goat{selected.length > 1 ? "s" : ""} to…</span>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])} data-testid="button-clear-move"><X />Clear</Button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pastures.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
              <Button key={p.id} variant="outline" size="sm" className="shrink-0" onClick={() => moveTo(selected, p.id)} data-testid={`button-move-to-${p.id}`}>{p.name}</Button>
            ))}
            <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => moveTo(selected, null)} data-testid="button-move-to-none">Unassigned</Button>
          </div>
        </div>
      )}
      {selected.length > 0 && <div className="h-28" aria-hidden />}

      <PastureDialog open={editing.open} onOpenChange={(o) => setEditing({ open: o, p: o ? editing.p : undefined })} pasture={editing.p} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Goats in this pasture will become Unassigned. Their records are kept.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleting) removePasture.mutate(deleting.id); setDeleting(null); }} data-testid="button-confirm-delete-pasture">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
