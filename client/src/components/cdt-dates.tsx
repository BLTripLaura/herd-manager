import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Field } from "@/components/forms";
import { useList, post, today, addDays, isCdt, shortName, matchesAnimal, fmtShort, goatName, regName } from "@/lib/herd";

/** Enter the last CD&T date for many goats at once. Each date becomes a CD&T record, and the reminders are figured from it. */
export function CdtDatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: animals = [] } = useList("animals");
  const { data: treatments = [] } = useList("treatments");
  const { data: meds = [] } = useList("medications");
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [dates, setDates] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [allDate, setAllDate] = useState(today());
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setDates({}); setChecked(new Set()); setQ(""); setAllDate(today()); } }, [open]);

  const last = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of treatments) if (isCdt(t.medName) && (!m.get(t.animalId) || t.date > m.get(t.animalId)!)) m.set(t.animalId, t.date);
    return m;
  }, [treatments]);
  const list = animals.filter((a) => a.status === "active" && (!onlyMissing || !last.has(a.id)) && matchesAnimal(a, q))
    .sort((a, b) => goatName(a).localeCompare(goatName(b)));
  const filled = Object.entries(dates).filter(([, d]) => d);
  const med = meds.find((m) => isCdt(m.name));

  const applyAll = () => {
    const next = { ...dates };
    for (const id of Array.from(checked)) next[id] = allDate;
    setDates(next); setChecked(new Set());
  };
  const save = async () => {
    const bad = filled.find(([, d]) => d > today());
    if (bad) return toast({ title: "A date is in the future", description: "Enter the date the CD&T was given.", variant: "destructive" });
    const early = filled.find(([id, d]) => { const g = animals.find((x) => x.id === Number(id)); return g?.dob && d < g.dob; });
    if (early) { const g = animals.find((x) => x.id === Number(early[0]))!; return toast({ title: "Date is before birth", description: `${goatName(g)} was born ${fmtShort(g.dob!)}.`, variant: "destructive" }); }
    setSaving(true);
    try {
      await post("/api/treatments/batch", { treatments: filled.map(([id, d]) => ({
        animalId: Number(id), medicationId: null, medName: med?.name ?? "CD&T vaccine", date: d, weightLbs: null, doseMl: null, route: "SQ",
        reason: "CD&T (date entered)", milkClearDate: d, meatClearDate: addDays(d, med?.meatWithdrawalDays ?? 0), givenBy: null, notes: null,
      })) });
      toast({ title: `${filled.length} CD&T date${filled.length === 1 ? "" : "s"} saved`, description: "Reminders are now figured from these dates." });
      onOpenChange(false);
    } catch (e: any) { toast({ title: "Couldn't save", description: String(e?.message ?? e), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enter CD&T dates</DialogTitle>
          <DialogDescription>Type the last date each goat got CD&T. Kids get their second dose 4 weeks after the first; everyone else gets a yearly booster.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input placeholder="Search name, tag, tattoo, breed…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-cdt-search" />
          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2"><Checkbox checked={onlyMissing} onCheckedChange={(c) => setOnlyMissing(!!c)} data-testid="check-cdt-missing" />Only goats with no CD&T date</label>
            <button className="font-medium text-primary" onClick={() => setChecked(new Set(list.map((a) => a.id)))} data-testid="button-cdt-check-all">Check all {list.length}</button>
          </div>
          {checked.size > 0 && (
            <div className="flex items-end gap-2 rounded-lg border bg-accent/40 p-2">
              <Field label={`Same date for ${checked.size} checked`} className="flex-1"><Input type="date" max={today()} value={allDate} onChange={(e) => setAllDate(e.target.value)} data-testid="input-cdt-all-date" /></Field>
              <Button size="sm" onClick={applyAll} data-testid="button-cdt-apply">Apply</Button>
            </div>
          )}
        </div>
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-lg border">
          {list.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">No goats match.</li>}
          {list.slice(0, 400).map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2">
              <Checkbox checked={checked.has(a.id)} onCheckedChange={() => { const n = new Set(checked); n.has(a.id) ? n.delete(a.id) : n.add(a.id); setChecked(n); }} data-testid={`check-cdt-${a.id}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{goatName(a)}</div>
                <div className="truncate text-xs text-muted-foreground">{last.has(a.id) ? `Last CD&T ${fmtShort(last.get(a.id)!)}` : "No CD&T date"}{a.dob ? ` · born ${fmtShort(a.dob)}` : ""}</div>
              </div>
              <Input type="date" min={a.dob ?? undefined} max={today()} className="h-9 w-[9.5rem] shrink-0" value={dates[a.id] ?? ""} onChange={(e) => setDates({ ...dates, [a.id]: e.target.value })} data-testid={`input-cdt-date-${a.id}`} />
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !filled.length} data-testid="button-cdt-save">{saving ? "Saving…" : `Save ${filled.length} date${filled.length === 1 ? "" : "s"}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
