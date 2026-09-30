import { useState } from "react";
import { Plus, Pencil, Calculator, Pill, ShieldCheck, AlertTriangle, Trash2, Syringe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader, Empty } from "@/components/shell";
import { CalfProSection } from "@/components/calf-pro";
import { MedDialog, Field, Pick, TreatDialog, MedPick } from "@/components/forms";
import { useList, useRemove, calcDoseMl, doseRuleText, latestWeight, shortName, type Medication , repeatText, goatName, regName } from "@/lib/herd";

export default function Meds() {
  const [treating, setTreating] = useState(false);
  const { data: meds = [] } = useList("medications");
  const { data: animals = [] } = useList("animals");
  const { data: weights = [] } = useList("weights");
  const remove = useRemove("medications");
  const [dlg, setDlg] = useState<{ open: boolean; med?: Medication }>({ open: false });
  const [calcMed, setCalcMed] = useState<string | null>(null);
  const [calcAnimal, setCalcAnimal] = useState<string | null>(null);
  const [calcW, setCalcW] = useState("");
  const cm = meds.find((m) => String(m.id) === calcMed);
  const dose = calcDoseMl(cm, Number(calcW));

  return (
    <>
      <TreatDialog open={treating} onOpenChange={setTreating} />
      <PageHeader title="Medications" sub="Dosing rules, withdrawal times and what's in the cabinet.">
        <Button variant="outline" onClick={() => setTreating(true)} data-testid="button-meds-treat"><Syringe />Log treatment</Button>
        <Button onClick={() => setDlg({ open: true })} data-testid="button-add-med"><Plus />Add medication</Button>
      </PageHeader>

      <CalfProSection />

      <div className="mb-6 rounded-lg border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Calculator className="h-4 w-4 text-primary" />Dose calculator</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
          <Field label="Medication"><MedPick value={calcMed} onChange={setCalcMed} testId="select-calc-med" meds={meds} /></Field>
          <Field label="Animal (optional)">
            <Pick value={calcAnimal} testId="select-calc-animal" onChange={(v) => { setCalcAnimal(v); const w = latestWeight(Number(v), weights); if (w) setCalcW(String(w.lbs)); }}
              options={animals.filter((a) => a.status === "active").map((a) => ({ value: String(a.id), label: `#${a.tag ?? "—"} ${goatName(a)}` }))} />
          </Field>
          <Field label="Weight (lb)"><Input type="number" inputMode="decimal" value={calcW} onChange={(e) => setCalcW(e.target.value)} data-testid="input-calc-weight" /></Field>
          <div className="rounded-md bg-primary px-4 py-2 text-center text-primary-foreground">
            <div className="text-xs opacity-80">Dose</div>
            <div className="text-lg font-bold tabular-nums" data-testid="text-calc-dose">{dose !== null ? `${dose} mL` : "—"}</div>
          </div>
        </div>
        {cm && <p className="mt-2 text-xs text-muted-foreground">{doseRuleText(cm)} · {cm.route}. Always check against your vet's instructions.</p>}
      </div>

      {meds.length === 0 ? <Empty icon={Pill} title="No medications yet">Add the products you keep on hand with your vet's dose and withdrawal times.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {meds.map((m) => {
            const low = (m.onHandMl ?? 0) <= (m.reorderAtMl ?? 0);
            const pct = Math.min(100, ((m.onHandMl ?? 0) / Math.max(1, (m.reorderAtMl ?? 0) * 3)) * 100);
            return (
              <div key={m.id} className="rounded-lg border bg-card p-4" data-testid={`card-med-${m.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold">{m.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{m.category}</Badge>
                      <Badge variant="outline">{m.route}</Badge>
                      {m.vetConfirmed ? <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-300"><ShieldCheck className="mr-1 h-3 w-3" />Vet confirmed</Badge>
                        : <Badge variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-300"><AlertTriangle className="mr-1 h-3 w-3" />Confirm with vet</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setDlg({ open: true, med: m })} data-testid={`button-edit-med-${m.id}`}><Pencil /></Button>
                    <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove.mutate(m.id)}><Trash2 /></Button>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Dose</dt><dd className="font-medium">{doseRuleText(m)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Milk / meat</dt><dd className="font-medium tabular-nums">{m.milkWithdrawalDays}d / {m.meatWithdrawalDays}d</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Repeat</dt><dd className="font-medium">{m.repeatDays ? repeatText(m.repeatDays, m.repeatUnit) : "—"}</dd></div>
                </dl>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">On hand</span>
                    <span className={low ? "font-semibold text-destructive" : "tabular-nums"}>{Math.round((m.onHandMl ?? 0) * 10) / 10} mL{low ? " · reorder" : ""}</span></div>
                  <Progress value={pct} className="h-1.5" />
                </div>
                {m.notes && <p className="mt-3 text-xs text-muted-foreground">{m.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
      <MedDialog open={dlg.open} onOpenChange={(o) => setDlg({ open: o, med: o ? dlg.med : undefined })} med={dlg.med} />
    </>
  );
}
