import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, AlertTriangle, Syringe, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Field, Pick } from "@/components/forms";
import { useApp } from "@/components/shell";
import { apiRequest } from "@/lib/queryClient";
import { useList, post, today, addDays, fmtShort, shortName, invalidateAll, CARE_TYPES, careType, lastCare, famachaFlag, type Animal, goatName, regName } from "@/lib/herd";
import { cn } from "@/lib/utils";

const OTHER = "__other";
const BCS = ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"];
const FAM_TONE = ["", "bg-red-600 text-white", "bg-rose-400 text-white", "bg-pink-300 text-pink-950", "bg-pink-100 text-pink-900", "bg-stone-100 text-stone-700"];

/** Check off an everyday job for many goats at once: hoof trims, FAMACHA scores, body condition, clipping, tests… */
export function BatchCare({ chosen, onTreat }: { chosen: Animal[]; onTreat: (ids: number[], reason: string) => void }) {
  const { toast } = useToast();
  const { careJob, setCareJob } = useApp();
  const { data: care = [] } = useList("care");
  const { data: tasks = [] } = useList("tasks");
  const [job, setJob] = useState("Hoof trim");
  const [custom, setCustom] = useState("");
  const [date, setDate] = useState(today());
  const [doneBy, setDoneBy] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [scores, setScores] = useState<Record<number, string>>({});
  const [remind, setRemind] = useState(true);
  const [every, setEvery] = useState("");
  const [tickTask, setTickTask] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flagged, setFlagged] = useState<number[]>([]);

  // A job handed over from a Today task
  useEffect(() => {
    if (!careJob) return;
    const t = careType(careJob.kind);
    if (t) setJob(t.name); else { setJob(OTHER); setCustom(careJob.kind); }
  }, [careJob]);

  const kind = job === OTHER ? custom.trim() : job;
  const type = careType(kind);
  useEffect(() => { setEvery(type?.every ? String(type.every) : ""); setRemind(!!type?.every); setScores({}); setFlagged([]); }, [kind]); // eslint-disable-line
  // Everyone picked starts checked; untick the ones you skipped
  const ids = chosen.map((a) => a.id).join(",");
  useEffect(() => { setDone((p) => Object.fromEntries(chosen.map((a) => [a.id, p[a.id] ?? true]))); }, [ids]); // eslint-disable-line

  const checked = chosen.filter((a) => done[a.id]);
  const allOn = chosen.length > 0 && checked.length === chosen.length;
  // An open to-do on Today for this job (e.g. "Hoof trim — milking string")
  const kindKey = kind.toLowerCase().split(/[\s/(]/)[0];
  const openTask = useMemo(() => {
    if (careJob?.taskId) return tasks.find((t) => t.id === careJob.taskId && !t.done);
    return kindKey ? tasks.filter((t) => !t.done && t.kind !== "dose" && t.title.toLowerCase().includes(kindKey) && t.dueDate <= addDays(date, 14)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] : undefined;
  }, [tasks, kindKey, careJob, date]);
  useEffect(() => setTickTask(true), [openTask?.id]);

  const save = async () => {
    if (!kind) return toast({ title: "Name the job", variant: "destructive" });
    if (!checked.length) return toast({ title: "Check at least one goat", variant: "destructive" });
    if (type?.score === "famacha" && checked.some((a) => !scores[a.id])) return toast({ title: "Score every checked goat", description: "Tap 1–5 for each, or untick the ones you didn't check.", variant: "destructive" });
    setBusy(true);
    const batchId = `C-${Date.now()}`;
    try {
      await post("/api/care/bulk", checked.map((a) => ({ animalId: a.id, date, kind, score: scores[a.id] || null, notes: note.trim() || null, doneBy: doneBy.trim() || null, batchId })));
      const extras: string[] = [];
      if (openTask && tickTask) { await apiRequest("PATCH", `/api/tasks/${openTask.id}`, { done: true }); extras.push(`checked off “${openTask.title}”`); }
      const gap = Math.floor(Number(every) || 0);
      if (remind && gap > 0) {
        const groups = Array.from(new Set(checked.map((a) => a.groupName).filter(Boolean)));
        const who = groups.length === 1 && chosen.every((a) => a.groupName === groups[0]) ? String(groups[0]).toLowerCase() : `${checked.length} goat${checked.length > 1 ? "s" : ""}`;
        await apiRequest("POST", "/api/tasks", { title: `${kind} — ${who}`, dueDate: addDays(date, gap), animalId: null, done: false, kind: "task", animalIds: checked.map((a) => a.id).join(",") });
        extras.push(`next one on Today ${fmtShort(addDays(date, gap))}`);
      }
      invalidateAll();
      const bad = type?.score === "famacha" ? checked.filter((a) => famachaFlag(scores[a.id])).map((a) => a.id) : [];
      setFlagged(bad);
      toast({ title: `${kind}: ${checked.length} goat${checked.length > 1 ? "s" : ""} done`, description: [bad.length ? `${bad.length} scored 4 or 5` : "", ...extras].filter(Boolean).join(" · ") || undefined });
      setCareJob(null); setNote("");
    } catch (e: any) { toast({ title: "Not saved", description: String(e.message ?? e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <Field label="Job" hint={type?.hint}>
          <Pick value={job} onChange={setJob} testId="select-care-job" options={[...CARE_TYPES.map((c) => ({ value: c.name, label: c.name })), { value: OTHER, label: "Other job…" }]} />
        </Field>
        {job === OTHER
          ? <Field label="Job name"><Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g., Horn check, Lice check" data-testid="input-care-custom" /></Field>
          : <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-care-date" /></Field>}
        {job === OTHER && <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-care-date" /></Field>}
        <Field label="Done by"><Input value={doneBy} onChange={(e) => setDoneBy(e.target.value)} data-testid="input-care-by" /></Field>
        <Field label="Note for everyone (optional)" className={job === OTHER ? "" : "sm:col-span-2"}><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g., Overgrown fronts on the milkers" data-testid="input-care-note" /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox checked={remind} onCheckedChange={(c) => setRemind(!!c)} data-testid="check-care-remind" />
          <span>Put the next one on Today in</span>
          <Input value={every} onChange={(e) => setEvery(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="h-8 w-16 text-right tabular-nums" aria-label="Days until next" data-testid="input-care-every" />
          <span>days</span>
        </label>
        {openTask && (
          <label className="flex items-center gap-2 rounded-md bg-accent/50 px-3 py-2 text-sm sm:col-span-2" data-testid="label-care-task">
            <Checkbox checked={tickTask} onCheckedChange={(c) => setTickTask(!!c)} data-testid="check-care-task" />
            <span>Also check off the Today task <b>{openTask.title}</b></span>
          </label>
        )}
      </div>

      {flagged.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="banner-famacha">
          <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><b>{flagged.length} scored 4 or 5.</b> Check with your vet about deworming, and recheck in 1–2 weeks.</span></span>
          <Button size="sm" onClick={() => onTreat(flagged, "FAMACHA 4–5")} data-testid="button-famacha-treat"><Syringe />Treat these {flagged.length}</Button>
        </div>
      )}

      {chosen.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center justify-between gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={allOn} onCheckedChange={(c) => setDone(Object.fromEntries(chosen.map((a) => [a.id, !!c])))} data-testid="check-care-all" />
              <span>{checked.length} of {chosen.length} done</span>
            </label>
            <span>{type?.score === "famacha" ? "FAMACHA score" : type?.score === "bcs" ? "Body condition" : type?.score === "result" ? "Result" : "Last done"}</span>
          </div>
          {chosen.map((a) => {
            const last = kind ? lastCare(a.id, kind, care) : undefined;
            const on = !!done[a.id];
            return (
              <div key={a.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2.5 last:border-b-0", !on && "opacity-50")} data-testid={`row-care-${a.id}`}>
                <label className="flex min-w-[11rem] flex-1 cursor-pointer items-center gap-3">
                  <Checkbox checked={on} onCheckedChange={(c) => setDone({ ...done, [a.id]: !!c })} data-testid={`check-care-${a.id}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{goatName(a)}{regName(a) && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{regName(a)}</span>}</span>
                    <span className="block text-xs text-muted-foreground">#{a.tag || "—"} · last {last ? `${fmtShort(last.date)}${last.score ? ` (${last.score})` : ""}` : "none on file"}</span>
                  </span>
                </label>
                {type?.score === "famacha" && (
                  <div className="flex gap-1" role="group" aria-label={`FAMACHA score for ${goatName(a)}`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" disabled={!on} onClick={() => setScores({ ...scores, [a.id]: String(n) })} data-testid={`button-fam-${a.id}-${n}`}
                        className={cn("h-9 w-9 rounded-md border text-sm font-bold tabular-nums transition-colors", scores[a.id] === String(n) ? cn(FAM_TONE[n], "ring-2 ring-primary ring-offset-1") : "bg-background hover:bg-accent")}>{n}</button>
                    ))}
                  </div>
                )}
                {type?.score === "bcs" && (
                  <div className="w-24"><Pick value={scores[a.id] ?? null} onChange={(v) => setScores({ ...scores, [a.id]: v })} placeholder="—" testId={`select-bcs-${a.id}`} options={BCS.map((b) => ({ value: b, label: b }))} /></div>
                )}
                {(type?.score === "result" || job === OTHER) && (
                  <Input className="h-9 w-full sm:w-44" value={scores[a.id] ?? ""} disabled={!on} onChange={(e) => setScores({ ...scores, [a.id]: e.target.value })} placeholder="Result / note" data-testid={`input-care-result-${a.id}`} />
                )}
              </div>
            );
          })}
          <div className="flex justify-end border-t bg-muted/30 px-3 py-3">
            <Button onClick={save} disabled={busy || !checked.length} data-testid="button-save-care"><ClipboardCheck />{busy ? "Saving…" : `Save ${kind || "job"} · ${checked.length} goat${checked.length === 1 ? "" : "s"}`}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Care tab on a goat's profile ---------------- */
export function CareTab({ animal }: { animal: Animal }) {
  const { toast } = useToast();
  const { data: care = [] } = useList("care");
  const [adding, setAdding] = useState(false);
  const [job, setJob] = useState("Hoof trim");
  const [custom, setCustom] = useState("");
  const [date, setDate] = useState(today());
  const [score, setScore] = useState("");
  const [note, setNote] = useState("");
  const [removeId, setRemoveId] = useState<number | null>(null);
  const mine = care.filter((c) => c.animalId === animal.id).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const latest = Array.from(mine.reduce((m, c) => (m.has(c.kind) ? m : m.set(c.kind, c)), new Map<string, (typeof mine)[number]>()).values());
  const kind = job === OTHER ? custom.trim() : job;
  const type = careType(kind);
  const add = async () => {
    if (!kind) return toast({ title: "Name the job", variant: "destructive" });
    await post("/api/care", { animalId: animal.id, date, kind, score: score.trim() || null, notes: note.trim() || null });
    invalidateAll(); setAdding(false); setScore(""); setNote("");
    toast({ title: `${kind} recorded for ${goatName(animal)}` });
  };
  const remove = async () => { if (removeId == null) return; await apiRequest("DELETE", `/api/care/${removeId}`); invalidateAll(); setRemoveId(null); };

  return (
    <div className="space-y-4">
      {latest.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {latest.map((c) => (
            <div key={c.kind} className={cn("rounded-lg border bg-card px-3 py-2", c.kind === "FAMACHA" && famachaFlag(c.score) && "border-amber-400")} data-testid={`card-care-${c.kind}`}>
              <div className="text-xs text-muted-foreground">{c.kind}</div>
              <div className="text-sm font-semibold">{fmtShort(c.date)}{c.score ? ` · ${c.score}` : ""}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Hoof trims, FAMACHA, body condition and other jobs. Do the whole herd at once in Batch entry → Care.</p>
        {!adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="button-add-care"><ClipboardCheck />Record</Button>}
      </div>
      {adding && (
        <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
          <Field label="Job"><Pick value={job} onChange={setJob} testId="select-care-one" options={[...CARE_TYPES.map((c) => ({ value: c.name, label: c.name })), { value: OTHER, label: "Other job…" }]} /></Field>
          {job === OTHER && <Field label="Job name"><Input value={custom} onChange={(e) => setCustom(e.target.value)} /></Field>}
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={type?.score === "famacha" ? "FAMACHA score (1–5)" : type?.score === "bcs" ? "Body condition (1–5)" : "Result (optional)"}>
            <Input value={score} onChange={(e) => setScore(e.target.value)} inputMode={type?.score && type.score !== "result" ? "decimal" : undefined} data-testid="input-care-one-score" />
          </Field>
          <Field label="Note" className="sm:col-span-2"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={add} data-testid="button-save-care-one">Save</Button></div>
        </div>
      )}
      {mine.length === 0 ? (
        !adding && <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No care jobs recorded yet.</div>
      ) : (
        <ul className="overflow-hidden rounded-lg border bg-card">
          {mine.map((c) => (
            <li key={c.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0" data-testid={`row-care-hist-${c.id}`}>
              <div className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{fmtShort(c.date)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.kind}{c.score && <span className={cn("ml-1.5 font-semibold", c.kind === "FAMACHA" && famachaFlag(c.score) && "text-amber-700 dark:text-amber-400")}>{c.score}</span>}</div>
                {(c.notes || c.doneBy) && <div className="truncate text-xs text-muted-foreground">{[c.notes, c.doneBy ? `by ${c.doneBy}` : ""].filter(Boolean).join(" · ")}</div>}
              </div>
              <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setRemoveId(c.id)} data-testid={`button-remove-care-${c.id}`}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={removeId != null} onOpenChange={(o) => !o && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle><AlertDialogDescription>This removes it from {goatName(animal)}'s history and reports.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove} data-testid="button-confirm-remove-care">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
