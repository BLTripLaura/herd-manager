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
import { tempNote, goatName, regName, doseText, taskDoseText } from "@/lib/herd";
import { useList, useSave, post, today, addDays, fmtShort, fmtTime, nowTime, shortName, type Task } from "@/lib/herd";

/** Log a scheduled repeat dose. Uses each goat's dose from the first treatment in the series. */
export function GiveDoseDialog({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { data: animals = [] } = useList("animals");
  const { data: treatments = [] } = useList("treatments");
  const { data: meds = [] } = useList("medications");
  const saveTask = useSave("tasks");
  const { toast } = useToast();
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(nowTime());
  const [givenBy, setGivenBy] = useState("");
  const [skip, setSkip] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [temps, setTemps] = useState<Record<number, string>>({});

  useEffect(() => { if (task) { setDate(today()); setTime(nowTime()); setSkip([]); setTemps({}); } }, [task?.id]); // eslint-disable-line

  if (!task) return null;
  const ids = String(task.animalIds || task.animalId || "").split(",").map(Number).filter(Boolean);
  const series = treatments.filter((t) => t.batchId === task.batchId).sort((a, b) => a.date.localeCompare(b.date));
  const med = meds.find((m) => m.id === task.medicationId);
  const rows = ids.map((id) => { const f = series.find((t) => t.animalId === id); return { a: animals.find((x) => x.id === id), dose: f ? f.doseMl : task.doseMl, text: f ? doseText(f) : taskDoseText(task) }; });
  const drops = rows.every((r) => r.dose == null) && rows.some((r) => r.text); // counted doses (drops, tablets, tubes): no mL to add up
  const giving = rows.filter((r) => r.a && !skip.includes(r.a.id));
  const total = giving.reduce((s, r) => s + (r.dose ?? 0), 0);

  const give = async () => {
    setBusy(true);
    try {
      const created = await post(`/api/tasks/${task.id}/give`, { date, time: time || null, givenBy: givenBy || null, skipIds: skip, temps: Object.fromEntries(Object.entries(temps).filter(([, x]) => Number(x) > 0).map(([k, x]) => [k, Number(x)])) });
      toast({ title: task.doseNo ? `Logged dose ${task.doseNo} of ${task.doseTotal}` : `Logged ${task.medName ?? task.title.split(" — ")[0]}${task.repeatEvery ? ` · next in ${task.repeatEvery} day${task.repeatEvery === 1 ? "" : "s"}` : ""}`, description: `${created.length} animal${created.length === 1 ? "" : "s"}${drops ? "" : ` · ${total.toFixed(1)} mL`}` });
      onClose();
    } finally { setBusy(false); }
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
          {rows.map(({ a, dose, text }) => a && (
            <li key={a.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
              <Checkbox checked={!skip.includes(a.id)} onCheckedChange={() => setSkip(skip.includes(a.id) ? skip.filter((x) => x !== a.id) : [...skip, a.id])} aria-label={`Include ${a.name}`} data-testid={`checkbox-give-${a.id}`} />
              <span className="min-w-0 flex-1 truncate text-sm">{goatName(a)} {a.tag && <span className="text-xs text-muted-foreground">#{a.tag}</span>}</span>
              <Input className={`h-8 w-20 text-right tabular-nums ${tempNote(temps[a.id])?.tone === "high" ? "border-destructive text-destructive" : tempNote(temps[a.id])?.tone === "low" ? "border-sky-500" : ""}`} inputMode="decimal" placeholder="°F" aria-label={`Temperature for ${a.name} (optional)`} value={temps[a.id] ?? ""} onChange={(e) => setTemps({ ...temps, [a.id]: e.target.value })} disabled={skip.includes(a.id)} data-testid={`input-give-temp-${a.id}`} />
              <span className="max-w-[8.5rem] shrink-0 text-right text-sm font-semibold tabular-nums">{text || (dose != null ? `${dose} mL` : "—")}</span>
            </li>
          ))}
        </ul>
        <p className="-mt-2 text-xs text-muted-foreground">Temperature is optional · normal 101.5–103.5 °F</p>
        {med && (
          <p className="text-xs text-muted-foreground">
            {series.length ? "Same dose as the first treatment." : "Dose from the reminder."} {(med.milkWithdrawalDays ?? 0) + (med.meatWithdrawalDays ?? 0) > 0
              ? <>Withdrawal restarts from this dose: milk clear {fmtShort(addDays(date, med.milkWithdrawalDays ?? 0))}, meat clear {fmtShort(addDays(date, med.meatWithdrawalDays ?? 0))}.</>
              : <b className="text-amber-700 dark:text-amber-300">No withdrawal days are entered for this medication — confirm with your vet.</b>}{drops ? "" : ` ${total.toFixed(1)} mL will come out of stock (${Math.round((med.onHandMl ?? 0) * 10) / 10} mL on hand).`}
          </p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={dismiss} data-testid="button-dismiss-dose">Mark done, don't log</Button>
          <Button onClick={give} disabled={busy || giving.length === 0} data-testid="button-confirm-give">Log dose for {giving.length}</Button>
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
        toast({ title: `Skipped ${med} dose ${task.doseNo} of ${task.doseTotal}`, description: next ? `Next dose ${fmtShort(next.dueDate)}${next.dueTime ? ` ${fmtTime(next.dueTime)}` : ""}` : "That was the last dose in the series." });
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
            <AlertDialogTitle>{mode === "skip" ? `Skip ${med} dose ${task.doseNo} of ${task.doseTotal}?` : `Stop ${med}?`}</AlertDialogTitle>
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
