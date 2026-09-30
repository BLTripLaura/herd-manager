import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Field } from "@/components/forms";
import { apiRequest } from "@/lib/queryClient";
import { post, today, fmtShort, fmtDate, shortName, invalidateAll, daysInMilk, isMilking, MILK_STATUS, type MilkStatus, type Animal, type Lactation, goatName, regName } from "@/lib/herd";
import { cn } from "@/lib/utils";

const TONE: Record<MilkStatus, string> = {
  milking: "border-transparent bg-primary/15 text-primary",
  mastitis: "border-transparent bg-destructive/15 text-destructive",
  drying: "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  dry: "border-muted-foreground/30 bg-transparent text-muted-foreground",
};

export function MilkBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status || !(status in MILK_STATUS)) return null;
  return <Badge variant="outline" className={cn(TONE[status as MilkStatus], className)} data-testid={`badge-milk-${status}`}>{MILK_STATUS[status as MilkStatus]}</Badge>;
}

const CHOICES: { value: MilkStatus; hint: string }[] = [
  { value: "milking", hint: "Milking normally" },
  { value: "mastitis", hint: "Still in milk, milk kept out of the tank" },
  { value: "drying", hint: "Being dried off, days still count" },
  { value: "dry", hint: "Ends this lactation, days stop" },
];

/** Change a doe's milk status: In milk / Mastitis / Drying up / Dry. Also lets you fix the fresh date of her current lactation. */
export function MilkStatusDialog({ animal, lactations, open, onOpenChange }: { animal: Animal; lactations: Lactation[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const dim = daysInMilk(animal.id, lactations);
  const [status, setStatus] = useState<MilkStatus>("milking");
  const [date, setDate] = useState(today());
  const [fresh, setFresh] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) { setStatus((animal.milkStatus as MilkStatus) || (animal.inMilk ? "milking" : "milking")); setDate(today()); setFresh(dim.open?.startDate ?? ""); }
  }, [open]); // eslint-disable-line
  const starting = isMilking(status) && !dim.open; // a new lactation begins on this date
  const save = async () => {
    setSaving(true);
    try {
      if (dim.open && fresh && fresh !== dim.open.startDate) await apiRequest("PATCH", `/api/lactations/${dim.open.id}`, { startDate: fresh });
      if (status !== animal.milkStatus) await post(`/api/animals/${animal.id}/milk-status`, { status, date });
      invalidateAll();
      toast({
        title: `${goatName(animal)}: ${MILK_STATUS[status]}`,
        description: status === "dry" ? (dim.open ? `Lactation closed at ${dim.current} days in milk` : undefined)
          : status === "mastitis" ? "Log her treatment so the milk hold is tracked." : starting ? `Days in milk count from ${fmtShort(date)}` : undefined,
      });
      onOpenChange(false);
    } catch (e: any) { toast({ title: "Could not save", description: String(e.message ?? e), variant: "destructive" }); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Milk status</DialogTitle>
          <DialogDescription>{goatName(animal)}{dim.current !== null ? ` · day ${dim.current} of this lactation` : ""} · {dim.total} lifetime days in milk</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {CHOICES.map((c) => (
            <button key={c.value} type="button" onClick={() => setStatus(c.value)} data-testid={`button-milk-${c.value}`}
              className={cn("rounded-md border px-3 py-2.5 text-left transition-colors", status === c.value ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent")}>
              <div className="text-sm font-semibold">{MILK_STATUS[c.value]}</div>
              <div className="text-xs leading-snug text-muted-foreground">{c.hint}</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {status !== animal.milkStatus && (
            <Field label={starting ? "Fresh date (lactation starts)" : status === "dry" ? "Dry date" : "Date"}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-milk-date" />
            </Field>
          )}
          {dim.open && (
            <Field label="Fresh date this lactation" hint="Fix it here if the kidding date was off.">
              <Input type="date" value={fresh} onChange={(e) => setFresh(e.target.value)} data-testid="input-fresh-date" />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="button-save-milk-status">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lactation history for the Milk tab */
export function LactationList({ animalId, lactations }: { animalId: number; lactations: Lactation[] }) {
  const dim = daysInMilk(animalId, lactations);
  if (!dim.count) return <p className="text-sm text-muted-foreground">No lactations on file yet. Recording a kidding with "She's in milk" checked starts one.</p>;
  return (
    <div className="rounded-md border" data-testid="list-lactations">
      <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
        <span className="font-semibold">Lactations</span>
        <span className="tabular-nums text-muted-foreground" data-testid="text-lifetime-dim">{dim.total} lifetime days in milk</span>
      </div>
      <ul>
        {[...dim.list].reverse().map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0">
            <span>#{l.no} · fresh {fmtDate(l.startDate)}{l.endDate ? ` · dry ${fmtShort(l.endDate)}` : ""}</span>
            <span className={cn("shrink-0 tabular-nums", !l.endDate && "font-semibold text-primary")}>{l.days} days{!l.endDate ? " so far" : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
