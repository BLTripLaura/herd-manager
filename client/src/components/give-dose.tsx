import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Field } from "@/components/forms";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MoreVertical, SkipForward, OctagonX } from "lucide-react";
import { tempNote, goatName, regName, doseText, taskDoseText, doseOfText } from "@/lib/herd";
import { useList, useSave, post, today, addDays, fmtShort, fmtTime, nowTime, shortName, latestWeight, isWeightDosed, calcDoseMl, saveDoseWeights, weightChanged, isTabletMg, tabletDose, type Task } from "@/lib/herd";
import { weightOk } from "@/components/weight-check";
import { Check } from "lucide-react";

/** Log a scheduled repeat dose. Fixed doses repeat the first treatment's dose; weight-based doses are
    worked out again from each goat's newest weight, which has to be checked (or updated) first. */
export function GiveDoseDialog({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { data: animals = [] } = useList("animals");
  const { data: treatments = [] } = useList("treatments");
  const { data: meds = [] } = useList("medications");
  const { data: weightList = [] } = useList("weights");
  const saveTask = useSave("tasks");
  const { toast } = useToast();
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(nowTime());
  const [givenBy, setGivenBy] = useState("");
  const [skip, setSkip] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [temps, setTemps] = useState<Record<number, string>>({});
  const [wv, setWv] = useState<Record<number, string>>({}); // typed weights
  const [wok, setWok] = useState<Record<number, boolean>>({}); // weight on file confirmed
  // Re-evaluate before this dose: keep going, give this as the last dose, or stop without giving
  const [plan, setPlan] = useState<"" | "go" | "last" | "stop">("");
  const [evalNote, setEvalNote] = useState("");
  const ongoing = !!task?.doseNo && !task?.doseTotal;
  const askEval = !!task?.reeval || ongoing;

  useEffect(() => { if (task) { setDate(today()); setTime(nowTime()); setSkip([]); setTemps({}); setWv({}); setWok({}); setPlan(""); setEvalNote(""); } }, [task?.id]); // eslint-disable-line

  if (!task) return null;
  const ids = String(task.animalIds || task.animalId || "").split(",").map(Number).filter(Boolean);
  const series = treatments.filter((t) => t.batchId === task.batchId).sort((a, b) => a.date.localeCompare(b.date));
  const med = meds.find((m) => m.id === task.medicationId);
  const rows = ids.map((id) => {
    const f = series.find((t) => t.animalId === id);
    const lw = latestWeight(id, weightList);
    const w = wv[id] ?? (lw ? String(lw.lbs) : "");
    // Worked out again from the newest (checked) weight only when the series is an mL dose by weight.
    // Doses set as tablets, mg or text (like "15 mg") repeat as they were.
    const b = f ?? series[0];
    // Tablets in mg: later dose from the newest weight, rounded to the tablet sizes (worked out the same way on the server)
    const tabRow = isTabletMg(med) && (b ? !!b.doseDetail : true);
    const td = tabRow ? tabletDose(med, w, false) : null;
    const wb = tabRow ? isWeightDosed(med) : isWeightDosed(med) && (f ? f.doseMl != null && !f.pillCount && !f.drops : task.doseMl != null || !task.doseText);
    const calc = wb && !tabRow ? calcDoseMl(med, Number(w)) : null;
    const dose = tabRow ? null : wb ? calc : f ? f.doseMl : task.doseMl;
    const text = tabRow ? td?.text ?? (wb ? "needs weight" : "") : wb ? (calc != null ? `${calc} mL` : "") : (f ? doseText(f) : "") || taskDoseText(task);
    return { a: animals.find((x) => x.id === id), wb, tabRow, lw, w, ok: (!wb || weightOk(w, lw, !!wok[id])) && (!tabRow || !!td), dose, text };
  });
  const byWeight = rows.some((r) => r.wb);
  const drops = rows.every((r) => r.dose == null) && rows.some((r) => r.text); // counted doses (drops, tablets, tubes): no mL to add up
  const giving = rows.filter((r) => r.a && !skip.includes(r.a.id));
  const total = giving.reduce((s, r) => s + (r.dose ?? 0), 0);

  const unchecked = giving.filter((r) => !r.ok);
  const stopNow = async () => {
    setBusy(true);
    try {
      await post(`/api/tasks/${task.id}/stop`, {});
      toast({ title: `Stopped ${task.title.split(" — ")[0]}`, description: "Marked resolved. No more doses on the list." });
      onClose();
    } catch (e: any) { toast({ title: "Could not stop the doses", description: String(e?.message ?? e), variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const give = async () => {
    if (task.reeval && !plan) return toast({ title: "Re-evaluate first", description: "Pick keep going, last dose, or resolved.", variant: "destructive" });
    if (plan === "stop") return stopNow();
    if (unchecked.length) return toast({ title: `Check ${unchecked.length} weight${unchecked.length === 1 ? "" : "s"} first`, description: "The dose goes by weight. Tap Still correct, or type today's weight.", variant: "destructive" });
    setBusy(true);
    try {
      const extra = byWeight ? {
        doses: Object.fromEntries(giving.filter((r) => r.wb && !r.tabRow).map((r) => [r.a!.id, r.dose])),
        weights: Object.fromEntries(giving.filter((r) => r.wb).map((r) => [r.a!.id, Number(r.w) || null])),
      } : {};
      if (byWeight) await saveDoseWeights(giving.filter((r) => r.wb).map((r) => ({ animalId: r.a!.id, lbs: r.w, date })), weightList);
      const evalTxt = askEval && (plan || evalNote.trim()) ? [plan === "last" ? "Re-evaluated: last dose, resolved" : plan === "go" ? "Re-evaluated: continue" : "", evalNote.trim()].filter(Boolean).join(" · ") : null;
      const created = await post(`/api/tasks/${task.id}/give`, { ...extra, stopAfter: plan === "last", note: evalTxt, date, time: time || null, givenBy: givenBy || null, skipIds: skip, temps: Object.fromEntries(Object.entries(temps).filter(([, x]) => Number(x) > 0).map(([k, x]) => [k, Number(x)])) });
      toast({ title: task.doseNo ? `Logged ${doseOfText(task)}` : `Logged ${task.medName ?? task.title.split(" — ")[0]}${task.repeatEvery ? ` · next in ${task.repeatEvery} ${task.repeatUnit === "hours" ? "hour" : "day"}${task.repeatEvery === 1 ? "" : "s"}` : ""}`, description: `${created.length} animal${created.length === 1 ? "" : "s"}${drops ? "" : ` · ${total.toFixed(1)} mL`}` });
      onClose();
    } catch (e: any) { toast({ title: "Could not log the dose", description: String(e?.message ?? e), variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const dismiss = async () => {
    await saveTask.mutateAsync({ id: task.id, done: true });
    toast({ title: "Marked done without logging" });
    onClose();
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task.doseNo ? "Give repeat dose" : "Give dose"}</DialogTitle>
          <DialogDescription>{task.doseNo ? task.title : task.title.split(" — ")[0]}{task.notes ? ` · ${task.notes}` : ""} · scheduled {fmtShort(task.dueDate)}{task.dueTime ? ` at ${fmtTime(task.dueTime)}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date given"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-give-date" /></Field>
          <Field label="Time given"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid="input-give-time" /></Field>
          <Field label="Given by" className="col-span-2"><Input value={givenBy} onChange={(e) => setGivenBy(e.target.value)} /></Field>
        </div>
        <ul className="overflow-hidden rounded-md border">
          {rows.map(({ a, dose, text, lw, w, ok, wb }) => a && (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-2 last:border-b-0">
              <Checkbox checked={!skip.includes(a.id)} onCheckedChange={() => setSkip(skip.includes(a.id) ? skip.filter((x) => x !== a.id) : [...skip, a.id])} aria-label={`Include ${a.name}`} data-testid={`checkbox-give-${a.id}`} />
              <span className="min-w-0 flex-1 truncate text-sm">{goatName(a)} {a.tag && <span className="text-xs text-muted-foreground">#{a.tag}</span>}</span>
              <Input className={`h-8 w-20 text-right tabular-nums ${tempNote(temps[a.id])?.tone === "high" ? "border-destructive text-destructive" : tempNote(temps[a.id])?.tone === "low" ? "border-sky-500" : ""}`} inputMode="decimal" placeholder="°F" aria-label={`Temperature for ${a.name} (optional)`} value={temps[a.id] ?? ""} onChange={(e) => setTemps({ ...temps, [a.id]: e.target.value })} disabled={skip.includes(a.id)} data-testid={`input-give-temp-${a.id}`} />
              <span className="max-w-[8.5rem] shrink-0 text-right text-sm font-semibold tabular-nums">{text || (dose != null ? `${dose} mL` : "—")}</span>
              {wb && !skip.includes(a.id) && (
                <div className="flex basis-full items-center gap-2 pl-7 text-xs" data-testid={`row-give-weight-${a.id}`}>
                  <Input className={`h-8 w-20 text-right tabular-nums ${ok ? "border-emerald-500/60" : "border-amber-400"}`} inputMode="decimal" placeholder="lb" aria-label={`Weight for ${a.name}`} value={w} onChange={(e) => { setWv({ ...wv, [a.id]: e.target.value }); setWok({ ...wok, [a.id]: false }); }} data-testid={`input-give-weight-${a.id}`} />
                  <span className="text-muted-foreground">lb</span>
                  {weightChanged(w, lw)
                    ? <span className="font-medium text-emerald-700 dark:text-emerald-300">New weight, will be saved</span>
                    : lw ? <button type="button" onClick={() => setWok({ ...wok, [a.id]: !wok[a.id] })} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium ${ok ? "border-emerald-500/60 text-emerald-700 dark:text-emerald-300" : "border-amber-400 text-amber-800 dark:text-amber-200"}`} data-testid={`button-give-wok-${a.id}`}>{ok ? <><Check className="h-3 w-3" />Still correct</> : `Still ${lw.lbs} lb? (weighed ${fmtShort(lw.date)})`}</button>
                    : <span className="font-medium text-amber-800 dark:text-amber-200">Enter weight</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="-mt-2 text-xs text-muted-foreground">Temperature is optional · normal 101.5–103.5 °F</p>
        {askEval && (
          <div className={`rounded-md border p-3 ${task.reeval && !plan ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : ""}`} data-testid="box-reeval">
            <div className="text-sm font-semibold">{task.reeval ? "Re-evaluate before this dose" : "Until resolved"}</div>
            <p className="mb-2 text-xs text-muted-foreground">How is she doing?</p>
            <div className="grid gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label="Re-evaluate">
              {([["go", "Keep going", "Give this dose; the next one stays on the list"], ["last", "Last dose", "Give this dose, then it's resolved"], ["stop", "Resolved, stop", "Don't give; no more doses"]] as const).map(([k, label, hint]) => (
                <button key={k} type="button" role="radio" aria-checked={plan === k} onClick={() => setPlan(plan === k && !task.reeval ? "" : k)}
                  className={`rounded-md border px-2.5 py-2 text-left text-sm ${plan === k ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary"}`} data-testid={`button-reeval-${k}`}>
                  <span className="block font-semibold">{label}</span><span className={`block text-xs ${plan === k ? "opacity-90" : "text-muted-foreground"}`}>{hint}</span>
                </button>
              ))}
            </div>
            <Input className="mt-2" value={evalNote} onChange={(e) => setEvalNote(e.target.value)} placeholder="Notes (optional), e.g. eating well, limp better" data-testid="input-reeval-note" />
          </div>
        )}
        {med && (
          <p className="text-xs text-muted-foreground">
            {byWeight ? "Dose worked out from the newest weight." : series.length ? "Same dose as the first treatment." : "Dose from the reminder."} {(med.milkWithdrawalDays ?? 0) + (med.meatWithdrawalDays ?? 0) > 0
              ? <>Withdrawal restarts from this dose: milk clear {fmtShort(addDays(date, med.milkWithdrawalDays ?? 0))}, meat clear {fmtShort(addDays(date, med.meatWithdrawalDays ?? 0))}.</>
              : <b className="text-amber-700 dark:text-amber-300">No withdrawal days are entered for this medication — confirm with your vet.</b>}{drops ? "" : ` ${total.toFixed(1)} mL will come out of stock (${Math.round((med.onHandMl ?? 0) * 10) / 10} mL on hand).`}
          </p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={dismiss} data-testid="button-dismiss-dose">Mark done, don't log</Button>
          <Button onClick={give} disabled={busy || (plan !== "stop" && giving.length === 0)} variant={plan === "stop" ? "destructive" : "default"} data-testid="button-confirm-give">{plan === "stop" ? "Stop, resolved" : plan === "last" ? `Log last dose for ${giving.length}` : `Log dose for ${giving.length}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Skip or stop a scheduled repeat dose from the to-do list */
export function DoseMenu({ task, tasks }: { task: Task; tasks: Task[] }) {
  const { data: animals = [] } = useList("animals");
  const { toast } = useToast();
  const [mode, setMode] = useState<null | "skip" | "stop">(null);
  const [keep, setKeep] = useState<number[]>([]); // goats in a group dose that keep going
  const [busy, setBusy] = useState(false);
  const ids = String(task.animalIds || task.animalId || "").split(",").map(Number).filter(Boolean);
  const names = ids.map((id) => animals.find((a) => a.id === id)).filter(Boolean);
  const who = names.length <= 3 ? names.map((a) => goatName(a!)).join(", ") : `${names.length} goats`;
  const med = task.title.split(" — ")[0];
  const left = tasks.filter((k) => !k.done && k.kind === "dose" && (task.batchId ? k.batchId === task.batchId : k.id === task.id))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? "").localeCompare(b.dueTime ?? ""));
  const next = left.find((k) => k.id !== task.id);
  const stopIds = ids.filter((id) => !keep.includes(id));
  const run = async () => {
    setBusy(true);
    try {
      if (mode === "skip") {
        await post(`/api/tasks/${task.id}/skip`);
        toast({ title: `Skipped ${med} ${doseOfText(task)}`, description: next ? `Next dose ${fmtShort(next.dueDate)}${next.dueTime ? ` ${fmtTime(next.dueTime)}` : ""}` : "That was the last dose in the series." });
      } else {
        if (!stopIds.length) { toast({ title: "Pick at least one goat to stop", variant: "destructive" }); return; }
        await post(`/api/tasks/${task.id}/stop`, { animalIds: stopIds });
        toast({ title: `Stopped ${med}`, description: stopIds.length === ids.length ? `${left.length} remaining dose${left.length === 1 ? "" : "s"} removed` : `Stopped for ${stopIds.length} goat${stopIds.length === 1 ? "" : "s"}; the others keep going` });
      }
      setMode(null);
    } finally { setBusy(false); }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="More dose options" data-testid={`button-dose-more-${task.id}`}><MoreVertical className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMode("skip")} data-testid={`menu-skip-${task.id}`}><SkipForward className="mr-2 h-4 w-4" />Skip this dose</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setKeep([]); setMode("stop"); }} className="text-destructive focus:text-destructive" data-testid={`menu-stop-${task.id}`}><OctagonX className="mr-2 h-4 w-4" />Stop remaining doses</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{mode === "skip" ? `Skip ${med} ${doseOfText(task)}?` : `Stop ${med}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {mode === "skip"
                ? <>Nothing is logged for {who}. {next ? <>The next dose stays on {fmtShort(next.dueDate)}{next.dueTime ? ` at ${fmtTime(next.dueTime)}` : ""}.</> : "This is the last dose, so the series ends."}</>
                : <>Removes this dose and the {left.length - 1 > 0 ? `${left.length - 1} after it` : "rest of the series"} ({left.length} in all) from the list. Doses already given stay in the records.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mode === "stop" && ids.length > 1 && (
            <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-md border p-3 text-sm" data-testid="stop-goats">
              <div className="mb-1 text-xs text-muted-foreground">Stop for:</div>
              {ids.map((id) => { const a = animals.find((x) => x.id === id); return (
                <label key={id} className="flex items-center gap-2">
                  <Checkbox checked={!keep.includes(id)} onCheckedChange={(c) => setKeep((k) => (c ? k.filter((x) => x !== id) : [...k, id]))} />
                  {a ? goatName(a) : `Goat ${id}`}
                </label>
              ); })}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); run(); }} disabled={busy} className={mode === "stop" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""} data-testid="button-confirm-dose-action">
              {busy ? "Saving…" : mode === "skip" ? "Skip dose" : stopIds.length === ids.length ? "Stop all doses" : `Stop for ${stopIds.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
