import { useState } from "react";
import { Link } from "wouter";
import { Baby, Check, Scale, Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  useList, useSave, post, today, daysBetween, fmtShort, shortName, nowTime,
  calcDoseMl, doseRuleText, saveDoseWeights, weightChanged, calfProKids, calfProEnrolled, isCalfPro, weaned, CALF_PRO, CALF_PRO_AGE, goatName, regName } from "@/lib/herd";

/** Kid program: Calf-Pro once a day from 4 days old until weaned, weighed every week */
export function CalfProSection({ onGiven }: { onGiven?: () => void } = {}) {
  const { toast } = useToast();
  const { data: animals = [] } = useList("animals");
  const { data: care = [] } = useList("care");
  const { data: treatments = [] } = useList("treatments");
  const { data: weights = [] } = useList("weights");
  const { data: meds = [] } = useList("medications");
  const saveAnimal = useSave("animals");
  const saveCare = useSave("care");
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [wVals, setWVals] = useState<Record<number, string>>({});
  const [checking, setChecking] = useState(false); // weight check before dosing
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const t = today();
  const med = meds.find((m) => isCalfPro(m.name));
  const hasDose = !!med && med.doseAmount > 0;
  const doseFor = (lbs?: number | null) => (hasDose ? calcDoseMl(med, lbs) : null); // 0.1 mL per lb, by the kid's latest weight
  const kids = calfProKids(animals, care, treatments, weights, t);
  const due = kids.filter((k) => k.started && !k.givenToday);
  const sel = picked ?? new Set(due.map((k) => k.animal.id));
  const chosen = due.filter((k) => sel.has(k.animal.id));
  const weighDue = kids.filter((k) => k.weighDue).length;
  // Young kids already on file that aren't on the program (born before it started)
  const young = animals.filter((a) => a.status === "active" && a.dob && a.dob <= t && daysBetween(a.dob, t) <= 120 && !calfProEnrolled(a, care) && !weaned(a.id, care) && a.calfPro !== 0)
    .sort((x, y) => y.dob!.localeCompare(x.dob!));

  // Weight each dose is worked out from: a weight typed in the row, or the newest one on file
  const useLbs = (k: typeof kids[number]) => (Number(wVals[k.animal.id]) > 0 ? Number(wVals[k.animal.id]) : k.lastWeight?.lbs);
  const give = () => {
    if (!chosen.length) return toast({ title: "Pick at least one kid", variant: "destructive" });
    const none = chosen.filter((k) => !useLbs(k));
    if (hasDose && none.length) return toast({ title: `Weigh ${none.length} kid${none.length === 1 ? "" : "s"} first`, description: `${none.map((k) => goatName(k.animal)).join(", ")}: type a weight in the row to work out the dose.`, variant: "destructive" });
    setChecking(true); // confirm the weights before logging
  };
  const logGive = async () => {
    setChecking(false);
    setBusy(true);
    try {
      await saveDoseWeights(chosen.map((k) => ({ animalId: k.animal.id, lbs: wVals[k.animal.id], date: t })), weights);
      setWVals((p) => { const n = { ...p }; for (const k of chosen) delete n[k.animal.id]; return n; });
      const time = nowTime();
      await post("/api/treatments/batch", chosen.map((k) => ({
        animalId: k.animal.id, medicationId: med?.id ?? null, medName: med?.name ?? CALF_PRO, date: t, time,
        doseMl: doseFor(useLbs(k)), weightLbs: useLbs(k) ?? null, route: med?.route ?? "Oral", reason: "Kid program (daily until weaned)",
        milkClearDate: t, meatClearDate: t,
      })));
      setPicked(null);
      toast({ title: `Calf-Pro logged for ${chosen.length} kid${chosen.length === 1 ? "" : "s"}` });
      onGiven?.();
    } catch (e: any) { toast({ title: "Could not save", description: String(e?.message ?? e), variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const saveWeights = async () => {
    const list = kids.filter((k) => Number(wVals[k.animal.id]) > 0).map((k) => ({ animalId: k.animal.id, date: t, lbs: Number(wVals[k.animal.id]), method: "scale" }));
    if (!list.length) return toast({ title: "Enter at least one weight", variant: "destructive" });
    setBusy(true);
    try { await post("/api/weights/bulk", list); setWVals({}); toast({ title: `Saved ${list.length} weight${list.length === 1 ? "" : "s"}` }); } finally { setBusy(false); }
  };
  const markWeaned = async (id: number, name: string) => {
    await saveCare.mutateAsync({ animalId: id, date: t, kind: "Weaning", notes: "Off Calf-Pro program" });
    toast({ title: `${name} marked weaned`, description: "Calf-Pro and weekly weights stop for this kid." });
  };
  const addKids = async (ids: number[]) => {
    for (const id of ids) await saveAnimal.mutateAsync({ id, calfPro: 1 } as any);
    toast({ title: `Added ${ids.length} kid${ids.length === 1 ? "" : "s"} to the Calf-Pro program` });
  };

  return (
    <section className="mb-6 rounded-lg border bg-card" data-testid="section-calf-pro">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold"><Baby className="h-4 w-4 text-primary" />Kid program: Calf-Pro</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Every new kid gets Calf-Pro once a day from {CALF_PRO_AGE} days old until weaned, and is weighed each week.{hasDose && med ? ` Dose: ${doseRuleText(med)} (${med.route}), mixed into the milk feeding.` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge variant="secondary" data-testid="badge-calfpro-due">{due.length} due today</Badge>
          <Badge variant="secondary">{kids.filter((k) => k.givenToday).length} given</Badge>
          <Badge variant={weighDue ? "default" : "secondary"} data-testid="badge-calfpro-weigh">{weighDue} to weigh</Badge>
        </div>
      </div>

      {!hasDose && (
        <p className="flex items-start gap-2 border-b bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="text-calfpro-dose">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Add the Calf-Pro dose from the label (mL per kid) on its medication card below so each dose is recorded.
        </p>
      )}

      {kids.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">No kids on the program. Kids born from today on join automatically when you add them.</p>
      ) : (
        <ul className="divide-y">
          {kids.map((k) => {
            const nm = goatName(k.animal);
            const canGive = k.started && !k.givenToday;
            return (
              <li key={k.animal.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 ${k.weighDue ? "bg-primary/5" : ""}`} data-testid={`row-calfpro-${k.animal.id}`}>
                <div className="flex w-4 shrink-0 items-center">
                  {canGive ? (
                    <Checkbox checked={sel.has(k.animal.id)} data-testid={`check-calfpro-${k.animal.id}`}
                      onCheckedChange={(c) => { const n = new Set(sel); c ? n.add(k.animal.id) : n.delete(k.animal.id); setPicked(n); }} />
                  ) : k.givenToday ? <Check className="h-4 w-4 text-primary" aria-label="Given today" /> : <span className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1 basis-56">
                  <Link href={`/animal/${k.animal.id}`} className="text-sm font-semibold hover:underline">{nm}</Link>
                  <div className="text-xs text-muted-foreground">
                    {k.age} day{k.age === 1 ? "" : "s"} old · {k.givenToday ? "Calf-Pro given today" : k.started ? "Calf-Pro due today" : `Calf-Pro starts ${fmtShort(k.start)}`}
                    {k.daysGiven > 0 && ` · ${k.daysGiven} day${k.daysGiven === 1 ? "" : "s"} so far`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {k.lastWeight ? `${k.lastWeight.lbs} lb on ${fmtShort(k.lastWeight.date)}` : "No weight yet"}
                    {hasDose && (useLbs(k) ? <span className="font-semibold text-foreground"> · dose {doseFor(useLbs(k))} mL{weightChanged(wVals[k.animal.id], k.lastWeight) ? ` (new ${useLbs(k)} lb)` : ""}</span> : " · weigh for dose")}
                    {k.weighDue ? <span className="font-semibold text-primary"> · weigh today</span> : ` · next weigh ${fmtShort(k.weighDate)}`}
                  </div>
                </div>
                <div className="ml-7 flex items-center gap-1.5 sm:ml-0">
                  <Scale className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input type="number" inputMode="decimal" placeholder="lb" className="h-8 w-20" value={wVals[k.animal.id] ?? ""}
                    onChange={(e) => setWVals({ ...wVals, [k.animal.id]: e.target.value })} data-testid={`input-calfpro-weight-${k.animal.id}`} />
                <Button size="sm" variant="ghost" onClick={() => markWeaned(k.animal.id, nm)} data-testid={`button-wean-${k.animal.id}`}>Weaned</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {kids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          <Button onClick={give} disabled={busy || !chosen.length} data-testid="button-give-calfpro">
            <Check />Give Calf-Pro to {chosen.length} kid{chosen.length === 1 ? "" : "s"}
          </Button>
          <Button variant="outline" onClick={saveWeights} disabled={busy || !Object.values(wVals).some((v) => Number(v) > 0)} data-testid="button-save-calfpro-weights">
            <Scale />Save weights
          </Button>
        </div>
      )}

      {young.length > 0 && (
        <div className="border-t px-4 py-3 text-xs">
          <button className="font-medium text-primary" onClick={() => setShowAdd(!showAdd)} data-testid="button-show-young">
            {showAdd ? "Hide" : `${young.length} younger kid${young.length === 1 ? "" : "s"} born before the program started`}
          </button>
          {showAdd && (
            <div className="mt-2">
              <p className="mb-2 text-muted-foreground">Add any that aren't weaned yet. Mark the rest weaned from their profile's Care tab.</p>
              <div className="flex flex-wrap gap-1.5">
                {young.map((a) => (
                  <button key={a.id} onClick={() => addKids([a.id])} className="rounded-full border px-2.5 py-1 hover-elevate" data-testid={`button-add-calfpro-${a.id}`}>
                    <Plus className="mr-1 inline h-3 w-3" />{goatName(a)} · {daysBetween(a.dob!, t)} d
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <AlertDialog open={checking} onOpenChange={setChecking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Check weights before dosing</AlertDialogTitle>
            <AlertDialogDescription>The Calf-Pro dose goes by weight. Make sure each weight is right, or cancel and type today's weight in the kid's row.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-sm" data-testid="list-calfpro-check">
            {chosen.map((k) => { const typed = weightChanged(wVals[k.animal.id], k.lastWeight); const old = !typed && k.weighDue; return (
              <li key={k.animal.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="min-w-0 truncate font-medium">{goatName(k.animal)}</span>
                <span className={`shrink-0 text-right text-xs ${old ? "font-semibold text-amber-800 dark:text-amber-200" : "text-muted-foreground"}`}>
                  {useLbs(k)} lb {typed ? "· new, will be saved" : k.lastWeight ? `· weighed ${fmtShort(k.lastWeight.date)}${old ? " · weigh-in due" : ""}` : ""}{hasDose ? <b className="ml-1 text-foreground">{doseFor(useLbs(k))} mL</b> : null}
                </span>
              </li>
            ); })}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Update weights</AlertDialogCancel>
            <AlertDialogAction onClick={logGive} data-testid="button-confirm-calfpro">Weights are right, give</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Profile line for a kid on (or off) the program */
export function CalfProStatus({ animalId }: { animalId: number }) {
  const { data: animals = [] } = useList("animals");
  const { data: care = [] } = useList("care");
  const { data: treatments = [] } = useList("treatments");
  const { data: weights = [] } = useList("weights");
  const save = useSave("animals");
  const a = animals.find((x) => x.id === animalId);
  if (!a?.dob || a.status !== "active") return null;
  const t = today();
  const k = calfProKids([a], care, treatments, weights, t)[0];
  const young = daysBetween(a.dob, t) <= 120 && !weaned(a.id, care);
  if (!k && !young) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2.5 text-xs" data-testid="card-calfpro-status">
      {k ? (
        <span><span className="font-semibold">On the Calf-Pro program</span> · {k.givenToday ? "given today" : k.started ? "due today" : `starts ${fmtShort(k.start)}`} · {k.weighDue ? "weigh today" : `next weigh ${fmtShort(k.weighDate)}`}</span>
      ) : <span className="text-muted-foreground">Not on the Calf-Pro program</span>}
      <Button size="sm" variant="ghost" onClick={() => save.mutate({ id: a.id, calfPro: k ? 0 : 1 } as any)} data-testid="button-toggle-calfpro">
        {k ? "Take off program" : "Add to program"}
      </Button>
    </div>
  );
}


