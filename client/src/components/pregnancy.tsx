import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Field } from "@/components/forms";
import { useList, post, today, addDays, fmtShort, shortName, latestWeight, calcDoseMl, isCdt, GESTATION_DAYS, RECHECK_DAYS, type Breeding, type Animal, goatName, regName } from "@/lib/herd";
import { apiRequest } from "@/lib/queryClient";
import { invalidateAll } from "@/lib/herd";
import { cn } from "@/lib/utils";

/** Quick ultrasound result: positive puts her on the due date roster, negative marks her open */
export function UltrasoundDialog({ breeding, onOpenChange }: { breeding: Breeding | null; onOpenChange: (o: boolean) => void }) {
  const { data: animals = [] } = useList("animals");
  const { toast } = useToast();
  const [result, setResult] = useState<string>("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (breeding) { setResult(""); setDate(today()); setNotes(breeding.usNotes ?? ""); } }, [breeding]);
  const doe = animals.find((a) => a.id === breeding?.doeId);
  const due = breeding ? addDays(breeding.date, GESTATION_DAYS) : "";
  const save = async () => {
    if (!breeding || !result) return toast({ title: "Pick a result", variant: "destructive" });
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/breedings/${breeding.id}`, {
        usResult: result, usDate: date, usNotes: notes || null, dueDate: due,
        status: result === "positive" ? "confirmed" : result === "negative" ? "open" : "bred",
      });
      invalidateAll();
      toast({
        title: result === "positive" ? `${doe ? goatName(doe) : "Doe"} is pregnant` : result === "negative" ? "Marked open" : "Recheck scheduled",
        description: result === "positive" ? `On the due date roster · due ${fmtShort(due)} · CD&T and BoSe ${fmtShort(addDays(due, -30))}`
          : result === "negative" ? "She goes back on heat watch." : `Ultrasound again ${fmtShort(addDays(date, RECHECK_DAYS))}`,
      });
      onOpenChange(false);
    } catch (e: any) { toast({ title: "Could not save", description: String(e.message ?? e), variant: "destructive" }); }
    finally { setSaving(false); }
  };
  const opts = [
    { v: "positive", l: "Positive", d: "Pregnant" },
    { v: "negative", l: "Negative", d: "Open" },
    { v: "recheck", l: "Recheck", d: `In ${RECHECK_DAYS} days` },
  ];
  return (
    <Dialog open={!!breeding} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ultrasound result</DialogTitle>
          <DialogDescription>{doe ? goatName(doe) : "Doe"} · bred {breeding ? fmtShort(breeding.date) : ""} to {breeding ? shortName(breeding.buck) : ""}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {opts.map((o) => (
            <button key={o.v} type="button" onClick={() => setResult(o.v)} data-testid={`button-us-${o.v}`}
              className={cn("rounded-lg border px-2 py-3 text-center hover-elevate", result === o.v ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
              <div className="text-sm font-semibold">{o.l}</div>
              <div className={cn("text-xs", result === o.v ? "opacity-90" : "text-muted-foreground")}>{o.d}</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date done"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-us-quick-date" /></Field>
          <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Twins seen…" data-testid="input-us-quick-notes" /></Field>
        </div>
        {result === "positive" && due && <p className="text-xs text-muted-foreground">Due {fmtShort(due)}. She'll be added to the due date roster, with CD&T and BoSe due {fmtShort(addDays(due, -30))}.</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !result} data-testid="button-save-us">Save result</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Give CD&T and BoSe 30 days before kidding: logs both treatments (doses from the Medicine Cabinet) */
export function PrekidDialog({ breeding, onOpenChange }: { breeding: Breeding | null; onOpenChange: (o: boolean) => void }) {
  const { data: animals = [] } = useList("animals");
  const { data: meds = [] } = useList("medications");
  const { data: weights = [] } = useList("weights");
  const { toast } = useToast();
  const [date, setDate] = useState(today());
  const [givenBy, setGivenBy] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (breeding) setDate(today()); }, [breeding]);
  const doe = animals.find((a) => a.id === breeding?.doeId);
  const cdt = meds.find((m) => /\bcd\s*&?\s*t\b|\bcdt\b/i.test(m.name));
  const bose = meds.find((m) => /\bbo-?se\b/i.test(m.name));
  const w = breeding ? latestWeight(breeding.doeId, weights) : null;
  const save = async () => {
    if (!breeding) return;
    setSaving(true);
    try {
      await post(`/api/breedings/${breeding.id}/prekid`, { date, givenBy });
      toast({ title: "CD&T and BoSe logged", description: `${doe ? goatName(doe) : "Doe"} · added to her treatment records` });
      onOpenChange(false);
    } catch (e: any) { toast({ title: "Could not save", description: String(e.message ?? e), variant: "destructive" }); }
    finally { setSaving(false); }
  };
  const line = (label: string, m?: typeof meds[number]) => (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 truncate font-medium">{m?.name ?? label}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{m ? `${m.doseAmount ?? "?"} ${m.doseUnit ?? ""}${m.route ? ` · ${m.route}` : ""}` : "Not in Medicine Cabinet"}</span>
    </li>
  );
  return (
    <Dialog open={!!breeding} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pre-kidding shots</DialogTitle>
          <DialogDescription>{doe ? goatName(doe) : "Doe"} · due {breeding?.dueDate ? fmtShort(breeding.dueDate) : ""}{w ? ` · ${w.lbs} lb` : ""}</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border bg-card">{line("CD&T vaccine", cdt)}{line("BoSe", bose)}</ul>
        {(!cdt || !bose) && <p className="text-xs text-muted-foreground">Add {!cdt && !bose ? "CD&T and BoSe" : !cdt ? "CD&T" : "BoSe"} to the Medicine Cabinet so doses, stock and withdrawal times are filled in automatically. It will still be logged by name.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date given"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-prekid-given" /></Field>
          <Field label="Given by"><Input value={givenBy} onChange={(e) => setGivenBy(e.target.value)} data-testid="input-prekid-by" /></Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="button-save-prekid">Log both shots</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Log one CD&T dose for one goat (kid series or yearly booster), dose and withdrawal from the Medicine Cabinet */
export function GiveCdtDialog({ item, onOpenChange }: { item: { animal: Animal; label: string } | null; onOpenChange: (o: boolean) => void }) {
  const { data: meds = [] } = useList("medications");
  const { data: weights = [] } = useList("weights");
  const { toast } = useToast();
  const [date, setDate] = useState(today());
  const [givenBy, setGivenBy] = useState("");
  const [dose, setDose] = useState("");
  const [saving, setSaving] = useState(false);
  const med = meds.find((m) => isCdt(m.name));
  const w = item ? latestWeight(item.animal.id, weights) : undefined;
  useEffect(() => { if (item) { setDate(today()); const c = calcDoseMl(med, w?.lbs); setDose(c ? String(c) : ""); } }, [item]); // eslint-disable-line
  const save = async () => {
    if (!item) return;
    setSaving(true);
    try {
      await post("/api/treatments/batch", { treatments: [{
        animalId: item.animal.id, medicationId: med?.id ?? null, medName: med?.name ?? "CD&T vaccine", date, weightLbs: w?.lbs ?? null,
        doseMl: dose ? Number(dose) : null, route: med?.route ?? "SQ", reason: item.label,
        milkClearDate: addDays(date, med?.milkWithdrawalDays ?? 0), meatClearDate: addDays(date, med?.meatWithdrawalDays ?? 0), givenBy: givenBy || null, notes: null,
      }] });
      toast({ title: "CD&T logged", description: `${goatName(item.animal)} · ${item.label}` });
      onOpenChange(false);
    } catch (e: any) { toast({ title: "Could not save", description: String(e.message ?? e), variant: "destructive" }); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Give CD&T</DialogTitle>
          <DialogDescription>{item ? `${goatName(item.animal)} · ${item.label}` : ""}{w ? ` · ${w.lbs} lb` : ""}</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-card px-3 py-2 text-sm">
          <span className="font-medium">{med?.name ?? "CD&T vaccine"}</span>
          <span className="ml-2 text-xs text-muted-foreground">{med ? `${med.doseAmount ?? "?"} ${med.doseUnit ?? ""}${med.route ? ` · ${med.route}` : ""}` : "Not in Medicine Cabinet, logged by name"}</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-cdt-date" /></Field>
          <Field label="Dose (mL)"><Input type="number" inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} data-testid="input-cdt-dose" /></Field>
          <Field label="Given by"><Input value={givenBy} onChange={(e) => setGivenBy(e.target.value)} data-testid="input-cdt-by" /></Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="button-save-cdt">Log CD&T</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
