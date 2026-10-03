import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Field, Pick, TempHint } from "@/components/forms";
import { useList, useSave, addDays, fmtShort, hasSide, SIDES, goatName, doseText, type Treatment } from "@/lib/herd";

const ROUTES = ["SQ", "IM", "IV", "Oral", "Topical", "Eye", "Intramammary"].map((x) => ({ value: x, label: x }));
const num = (x: any) => (x === "" || x == null || !Number.isFinite(Number(x)) ? null : Number(x));

/** Correct a treatment that was already logged: date, dose, route, reason, withdrawal dates… */
export function EditTreatmentDialog({ treatment: t, onClose }: { treatment: Treatment | null; onClose: () => void }) {
  const { data: meds = [] } = useList("medications");
  const { data: animals = [] } = useList("animals");
  const save = useSave("treatments");
  const { toast } = useToast();
  const [v, setV] = useState<any>({});
  useEffect(() => { if (t) setV({ ...t }); }, [t?.id]); // eslint-disable-line
  if (!t) return null;
  const set = (k: string) => (x: any) => setV((p: any) => ({ ...p, [k]: x }));
  const med = meds.find((m) => m.id === t.medicationId);
  const goat = animals.find((a) => a.id === t.animalId);
  const kind = t.pillCount != null ? "count" : t.drops != null ? "drops" : t.doseMl != null || (!t.doseDetail && t.medicationId) ? "ml" : "text";
  // A new date moves the withdrawal dates with it (by this medicine's withdrawal days)
  const changeDate = (d: string) => setV((p: any) => ({
    ...p, date: d,
    ...(med && d ? { milkClearDate: p.milkClearDate ? addDays(d, med.milkWithdrawalDays ?? 0) : p.milkClearDate, meatClearDate: p.meatClearDate ? addDays(d, med.meatWithdrawalDays ?? 0) : p.meatClearDate } : {}),
  }));
  const submit = async () => {
    if (!v.date) return toast({ title: "Enter the date", variant: "destructive" });
    if (!String(v.medName ?? "").trim()) return toast({ title: "Enter what was given", variant: "destructive" });
    const patch: any = {
      id: t.id, date: v.date, time: v.time || null, medName: String(v.medName).trim(), route: v.route || null, side: hasSide(v.route) ? v.side || null : null,
      weightLbs: num(v.weightLbs), tempF: num(v.tempF), reason: v.reason || null, givenBy: v.givenBy || null, notes: v.notes || null,
      milkClearDate: v.milkClearDate || null, meatClearDate: v.meatClearDate || null, doseDetail: String(v.doseDetail ?? "").trim() || null,
    };
    if (kind === "ml") patch.doseMl = num(v.doseMl);
    if (kind === "count") { patch.pillCount = num(v.pillCount); if (v.pillUnit) patch.pillUnit = v.pillUnit; }
    if (kind === "drops") patch.drops = num(v.drops);
    try {
      await save.mutateAsync(patch);
      toast({ title: "Treatment corrected", description: `${goat ? goatName(goat) : ""} · ${patch.medName}` });
      onClose();
    } catch (e: any) { toast({ title: "Could not save", description: String(e?.message ?? e), variant: "destructive" }); }
  };
  return (
    <Dialog open={!!t} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit treatment</DialogTitle>
          <DialogDescription>{goat ? goatName(goat) : ""} · logged as {t.medName}{doseText(t) ? ` · ${doseText(t)}` : ""} on {fmtShort(t.date)}. Changes are noted in the system log.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Medicine or treatment" className="col-span-2"><Input value={v.medName ?? ""} onChange={(e) => set("medName")(e.target.value)} data-testid="input-edit-med-name" /></Field>
          <Field label="Date"><Input type="date" value={v.date ?? ""} onChange={(e) => changeDate(e.target.value)} data-testid="input-edit-date" /></Field>
          <Field label="Time given"><Input type="time" value={v.time ?? ""} onChange={(e) => set("time")(e.target.value)} data-testid="input-edit-time" /></Field>
          {kind === "ml" && <Field label="Dose (mL)" hint={med ? "Stock is corrected to match" : undefined}><Input type="number" inputMode="decimal" step="0.1" value={v.doseMl ?? ""} onChange={(e) => set("doseMl")(e.target.value)} data-testid="input-edit-dose" /></Field>}
          {kind === "count" && <Field label={`How many (${v.pillUnit ?? "tablet"}s)`} hint="½ = 0.5"><Input type="number" inputMode="decimal" step="0.5" value={v.pillCount ?? ""} onChange={(e) => set("pillCount")(e.target.value)} data-testid="input-edit-count" /></Field>}
          {kind === "drops" && <Field label="Drops"><Input type="number" inputMode="numeric" value={v.drops ?? ""} onChange={(e) => set("drops")(e.target.value)} data-testid="input-edit-drops" /></Field>}
          <Field label="Route"><Pick value={v.route ?? null} onChange={set("route")} options={ROUTES} placeholder="—" testId="select-edit-route" /></Field>
          <Field label="Dose details" className="col-span-2" hint="Shown on the record, e.g. 11.25 mg: 1½ × 7.5 mg tablets"><Input value={v.doseDetail ?? ""} onChange={(e) => set("doseDetail")(e.target.value)} data-testid="input-edit-detail" /></Field>
          {hasSide(v.route) && <Field label="Side"><Pick value={v.side ?? null} onChange={set("side")} options={SIDES} placeholder="Left, right or both" /></Field>}
          <Field label="Weight (lb)"><Input type="number" inputMode="decimal" value={v.weightLbs ?? ""} onChange={(e) => set("weightLbs")(e.target.value)} data-testid="input-edit-weight" /></Field>
          <Field label="Temperature (°F)" hint={<TempHint f={v.tempF} />}><Input type="number" inputMode="decimal" step="0.1" value={v.tempF ?? ""} onChange={(e) => set("tempF")(e.target.value)} data-testid="input-edit-temp" /></Field>
          <Field label="Given by" className="col-span-2"><Input value={v.givenBy ?? ""} onChange={(e) => set("givenBy")(e.target.value)} /></Field>
          <Field label="Reason" className="col-span-2"><Input value={v.reason ?? ""} onChange={(e) => set("reason")(e.target.value)} data-testid="input-edit-reason" /></Field>
          <Field label="Notes" className="col-span-2"><Input value={v.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} /></Field>
          <Field label="Milk clear"><Input type="date" value={v.milkClearDate ?? ""} onChange={(e) => set("milkClearDate")(e.target.value)} data-testid="input-edit-milk-clear" /></Field>
          <Field label="Meat clear"><Input type="date" value={v.meatClearDate ?? ""} onChange={(e) => set("meatClearDate")(e.target.value)} data-testid="input-edit-meat-clear" /></Field>
          {med && <p className="col-span-2 -mt-1 text-xs text-muted-foreground">{med.name}: milk {med.milkWithdrawalDays ?? 0} days, meat {med.meatWithdrawalDays ?? 0} days. Changing the date moves these for you.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending} data-testid="button-save-edit-treatment">Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
