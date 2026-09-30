import { useMemo, useState } from "react";
import { Trophy, NotebookPen, Pencil, Trash2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Empty } from "@/components/shell";
import { Field } from "@/components/forms";
import { useList, useSave, useRemove, fmtDate, today, shortName, type Animal, type Show, type AnimalNote, goatName, regName } from "@/lib/herd";
import { cn } from "@/lib/utils";

const PLACINGS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "Grand Champion", "Reserve Grand Champion", "Best of Breed", "Best in Show", "Best Udder", "Junior Champion", "Senior Champion"];
const uniq = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter((x): x is string => !!x && !!x.trim()))).sort((a, b) => a.localeCompare(b));
const isTop = (p?: string | null) => !!p && /^(1st|grand|best|junior champ|senior champ)/i.test(p.trim());

function ConfirmDelete({ open, onOpenChange, title, body, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; body: string; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{body}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={onConfirm} data-testid="button-confirm-remove">Delete</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------------- Shows ---------------- */
function ShowDialog({ open, onOpenChange, animal, show }: { open: boolean; onOpenChange: (o: boolean) => void; animal: Animal; show?: Show }) {
  const { data: shows = [] } = useList("shows");
  const save = useSave("shows");
  const { toast } = useToast();
  const [v, setV] = useState<Partial<Show>>({});
  const [key, setKey] = useState<string>("");
  const k = `${open}-${show?.id ?? "new"}`;
  if (open && key !== k) { setKey(k); setV(show ? { ...show } : { date: today(), showName: shows.length ? [...shows].sort((a, b) => b.id - a.id)[0].showName : "", className: "", placing: "", notes: "" }); }
  if (!open && key) setKey("");
  const set = (f: keyof Show) => (x: string) => setV((p) => ({ ...p, [f]: x }));
  const names = uniq(shows.map((s) => s.showName));
  const classes = uniq(shows.map((s) => s.className));
  const submit = async () => {
    if (!v.showName?.trim()) return toast({ title: "Add the show name", variant: "destructive" });
    if (!v.date) return toast({ title: "Add the show date", variant: "destructive" });
    await save.mutateAsync({ ...(show ? { id: show.id } : {}), animalId: animal.id, date: v.date, showName: v.showName.trim(), className: v.className?.trim() || null, placing: v.placing?.trim() || null, notes: v.notes?.trim() || null });
    toast({ title: show ? "Show updated" : "Show added", description: `${goatName(animal)} · ${v.showName}` });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{show ? "Edit show" : "Add show"}</DialogTitle><DialogDescription>{goatName(animal)}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Show date"><Input type="date" value={v.date ?? ""} onChange={(e) => set("date")(e.target.value)} data-testid="input-show-date" /></Field>
          <Field label="Placing">
            <Input value={v.placing ?? ""} onChange={(e) => set("placing")(e.target.value)} list="dl-placings" placeholder="1st" data-testid="input-show-placing" />
            <datalist id="dl-placings">{PLACINGS.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Show name" className="col-span-2">
            <Input value={v.showName ?? ""} onChange={(e) => set("showName")(e.target.value)} list="dl-shownames" placeholder="Delaware State Fair ADGA Show" data-testid="input-show-name" />
            <datalist id="dl-shownames">{names.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Group / class" className="col-span-2">
            <Input value={v.className ?? ""} onChange={(e) => set("className")(e.target.value)} list="dl-showclasses" placeholder="Senior Doe 3 yrs" data-testid="input-show-class" />
            <datalist id="dl-showclasses">{classes.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Note" className="col-span-2"><Textarea rows={3} value={v.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} placeholder="Judge comments, awards, legs earned…" data-testid="input-show-notes" /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={save.isPending} data-testid="button-save-show">{show ? "Save" : "Add show"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShowsTab({ animal }: { animal: Animal }) {
  const { data: shows = [] } = useList("shows");
  const remove = useRemove("shows");
  const [dlg, setDlg] = useState<{ open: boolean; s?: Show }>({ open: false });
  const [del, setDel] = useState<Show | null>(null);
  const mine = useMemo(() => shows.filter((s) => s.animalId === animal.id).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id), [shows, animal.id]);
  const wins = mine.filter((s) => isTop(s.placing)).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground" data-testid="text-show-summary">{mine.length ? `${mine.length} ${mine.length === 1 ? "show" : "shows"}${wins ? ` · ${wins} first or top award${wins === 1 ? "" : "s"}` : ""}` : ""}</div>
        <Button onClick={() => setDlg({ open: true })} data-testid="button-add-show"><Plus />Add show</Button>
      </div>
      {mine.length === 0 ? <Empty icon={Trophy} title="No shows yet">Record each show with the date, show name, group or class, placing and any judge comments.</Empty> : (
        <ul className="overflow-hidden rounded-lg border bg-card">
          {mine.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 border-b px-4 py-3 last:border-b-0" data-testid={`row-show-${s.id}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{s.showName}</span>
                  {s.placing && <Badge variant={isTop(s.placing) ? "default" : "secondary"} className={cn(isTop(s.placing) && "gap-1")}>{isTop(s.placing) && <Trophy className="h-3 w-3" />}{s.placing}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{fmtDate(s.date)}{s.className ? ` · ${s.className}` : ""}</div>
                {s.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{s.notes}</p>}
              </div>
              <div className="flex shrink-0">
                <Button variant="ghost" size="icon" aria-label="Edit show" onClick={() => setDlg({ open: true, s })} data-testid={`button-edit-show-${s.id}`}><Pencil /></Button>
                <Button variant="ghost" size="icon" aria-label="Delete show" onClick={() => setDel(s)} data-testid={`button-delete-show-${s.id}`}><Trash2 /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ShowDialog open={dlg.open} onOpenChange={(o) => setDlg({ open: o, s: o ? dlg.s : undefined })} animal={animal} show={dlg.s} />
      <ConfirmDelete open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete this show?" body={del ? `${del.showName}, ${fmtDate(del.date)}` : ""} onConfirm={() => { if (del) remove.mutate(del.id); setDel(null); }} />
    </div>
  );
}

/* ---------------- Other (notes) ---------------- */
function NoteDialog({ open, onOpenChange, animal, note }: { open: boolean; onOpenChange: (o: boolean) => void; animal: Animal; note?: AnimalNote }) {
  const { data: notes = [] } = useList("animalNotes");
  const save = useSave("animalNotes");
  const { toast } = useToast();
  const [v, setV] = useState<Partial<AnimalNote>>({});
  const [key, setKey] = useState("");
  const k = `${open}-${note?.id ?? "new"}`;
  const lastBy = [...notes].sort((a, b) => b.id - a.id).find((n) => n.enteredBy)?.enteredBy ?? "";
  if (open && key !== k) { setKey(k); setV(note ? { ...note } : { date: today(), note: "", enteredBy: lastBy }); }
  if (!open && key) setKey("");
  const people = uniq(notes.map((n) => n.enteredBy));
  const submit = async () => {
    if (!v.note?.trim()) return toast({ title: "Write the note first", variant: "destructive" });
    if (!v.enteredBy?.trim()) return toast({ title: "Add who entered it", variant: "destructive" });
    await save.mutateAsync({ ...(note ? { id: note.id } : {}), animalId: animal.id, date: v.date || today(), note: v.note.trim(), enteredBy: v.enteredBy.trim() });
    toast({ title: note ? "Note updated" : "Note added", description: goatName(animal) });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{note ? "Edit note" : "Add note"}</DialogTitle><DialogDescription>{goatName(animal)}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><Input type="date" value={v.date ?? ""} onChange={(e) => setV((p) => ({ ...p, date: e.target.value }))} data-testid="input-note-date" /></Field>
          <Field label="Entered by">
            <Input value={v.enteredBy ?? ""} onChange={(e) => setV((p) => ({ ...p, enteredBy: e.target.value }))} list="dl-note-people" placeholder="Your name" data-testid="input-note-by" />
            <datalist id="dl-note-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Note" className="col-span-2"><Textarea rows={5} autoFocus value={v.note ?? ""} onChange={(e) => setV((p) => ({ ...p, note: e.target.value }))} placeholder="Hoof trim, behavior, sale inquiry, anything worth remembering…" data-testid="input-note-text" /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={save.isPending} data-testid="button-save-note">{note ? "Save" : "Add note"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NotesTab({ animal }: { animal: Animal }) {
  const { data: notes = [] } = useList("animalNotes");
  const remove = useRemove("animalNotes");
  const [dlg, setDlg] = useState<{ open: boolean; n?: AnimalNote }>({ open: false });
  const [del, setDel] = useState<AnimalNote | null>(null);
  const [q, setQ] = useState("");
  const mine = useMemo(() => notes.filter((n) => n.animalId === animal.id).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id), [notes, animal.id]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? mine.filter((n) => `${n.note} ${n.enteredBy ?? ""} ${fmtDate(n.date)}`.toLowerCase().includes(needle)) : mine;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {mine.length > 3 ? (
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" className="pl-9" data-testid="input-search-notes" />
          </div>
        ) : <div className="text-sm text-muted-foreground">{mine.length ? `${mine.length} ${mine.length === 1 ? "note" : "notes"}` : ""}</div>}
        <Button onClick={() => setDlg({ open: true })} className="shrink-0" data-testid="button-add-note"><Plus />Add note</Button>
      </div>
      {mine.length === 0 ? <Empty icon={NotebookPen} title="No notes yet">Anything about this goat, with the date and who wrote it: hoof trims, behavior, sale inquiries, appraisal scores.</Empty>
        : shown.length === 0 ? <Empty icon={Search} title="No matching notes">Try a different word.</Empty> : (
        <ul className="overflow-hidden rounded-lg border bg-card">
          {shown.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 border-b px-4 py-3 last:border-b-0" data-testid={`row-note-${n.id}`}>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{fmtDate(n.date)}</span>{n.enteredBy ? ` · ${n.enteredBy}` : ""}</div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{n.note}</p>
              </div>
              <div className="flex shrink-0">
                <Button variant="ghost" size="icon" aria-label="Edit note" onClick={() => setDlg({ open: true, n })} data-testid={`button-edit-note-${n.id}`}><Pencil /></Button>
                <Button variant="ghost" size="icon" aria-label="Delete note" onClick={() => setDel(n)} data-testid={`button-delete-note-${n.id}`}><Trash2 /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <NoteDialog open={dlg.open} onOpenChange={(o) => setDlg({ open: o, n: o ? dlg.n : undefined })} animal={animal} note={dlg.n} />
      <ConfirmDelete open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete this note?" body={del ? `${fmtDate(del.date)}${del.enteredBy ? ` · ${del.enteredBy}` : ""}: ${del.note.slice(0, 80)}` : ""} onConfirm={() => { if (del) remove.mutate(del.id); setDel(null); }} />
    </div>
  );
}
