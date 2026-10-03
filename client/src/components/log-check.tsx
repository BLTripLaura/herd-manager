import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Field, Pick, TempHint } from "@/components/forms";
import { useList, post, today, invalidateAll, latestWeight, weighedText, famachaFlag, goatName, type Animal } from "@/lib/herd";
import { cn } from "@/lib/utils";

const FAMACHA = ["1", "2", "3", "4", "5"];
const BCS = ["1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5"];

function Scores({ list, value, onChange, testId, warn }: { list: string[]; value: string; onChange: (v: string) => void; testId: string; warn?: (v: string) => boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {list.map((x) => (
        <button key={x} type="button" role="radio" aria-checked={value === x} onClick={() => onChange(value === x ? "" : x)}
          className={cn("h-10 min-w-10 rounded-md border px-2 text-sm font-semibold tabular-nums", value === x ? (warn?.(x) ? "border-amber-500 bg-amber-500 text-white" : "border-primary bg-primary text-primary-foreground") : "hover:border-primary")}
          data-testid={`${testId}-${x}`}>{x}</button>
      ))}
    </div>
  );
}

/** Weight, temperature, FAMACHA and body condition without logging a treatment. Fill in any of them. */
export function LogCheckDialog({ open, onOpenChange, animal }: { open: boolean; onOpenChange: (o: boolean) => void; animal: Animal }) {
  const { data: weights = [] } = useList("weights");
  const { toast } = useToast();
  const lw = latestWeight(animal.id, weights);
  const blank = { date: today(), lbs: "", method: "scale", temp: "", famacha: "", bcs: "", note: "", by: "" };
  const [v, setV] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV(blank); }, [open, animal.id]); // eslint-disable-line
  const set = (k: keyof typeof blank) => (x: string) => setV((p) => ({ ...p, [k]: x }));
  const lbs = Number(v.lbs), temp = Number(v.temp);
  const any = lbs > 0 || temp > 0 || v.famacha || v.bcs;
  const submit = async () => {
    if (!any) return toast({ title: "Nothing to save yet", description: "Enter a weight, temperature, FAMACHA or body condition.", variant: "destructive" });
    if (v.temp && !(temp >= 90 && temp <= 110)) return toast({ title: "Check the temperature", description: "Enter it in °F, e.g. 102.5", variant: "destructive" });
    setBusy(true);
    try {
      const notes = v.note.trim() || null, doneBy = v.by.trim() || null;
      const saved: string[] = [];
      if (lbs > 0) { await post("/api/weights", { animalId: animal.id, date: v.date, lbs: Math.round(lbs * 10) / 10, method: v.method }); saved.push(`${Math.round(lbs * 10) / 10} lb`); }
      const care: [string, string][] = [];
      if (temp > 0) care.push(["Temperature", `${temp} °F`]);
      if (v.famacha) care.push(["FAMACHA", v.famacha]);
      if (v.bcs) care.push(["Body condition", v.bcs]);
      for (const [kind, score] of care) { await post("/api/care", { animalId: animal.id, date: v.date, kind, score, notes, doneBy }); saved.push(kind === "Temperature" ? score : `${kind} ${score}`); }
      invalidateAll();
      toast({ title: `Saved for ${goatName(animal)}`, description: saved.join(" · ") });
      onOpenChange(false);
    } catch (e: any) { toast({ title: "Could not save", description: String(e?.message ?? e), variant: "destructive" }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a check</DialogTitle>
          <DialogDescription>{goatName(animal)} · weight, temperature, FAMACHA or body condition, no treatment needed. Fill in any of them.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" className="col-span-2"><Input type="date" value={v.date} onChange={(e) => set("date")(e.target.value)} data-testid="input-check-date" /></Field>
          <Field label="Weight (lb)" hint={lw ? `Last: ${weighedText(lw)}` : "No weight on file"}><Input type="number" inputMode="decimal" value={v.lbs} onChange={(e) => set("lbs")(e.target.value)} placeholder="e.g., 85" data-testid="input-check-weight" /></Field>
          <Field label="Weighed by"><Pick value={v.method} onChange={set("method")} options={[{ value: "scale", label: "Scale" }, { value: "tape", label: "Weight tape" }]} testId="select-check-method" /></Field>
          <Field label="Temperature (°F)" className="col-span-2" hint={<TempHint f={v.temp} />}><Input type="number" inputMode="decimal" step="0.1" value={v.temp} onChange={(e) => set("temp")(e.target.value)} placeholder="e.g., 102.5" data-testid="input-check-temp" /></Field>
          <Field label="FAMACHA (1–5)" className="col-span-2" hint={v.famacha && famachaFlag(v.famacha) ? <span className="font-semibold text-amber-700 dark:text-amber-300">4 or 5: needs attention</span> : "1 = red (good), 5 = white (anemic)"}>
            <Scores list={FAMACHA} value={v.famacha} onChange={set("famacha")} testId="button-check-famacha" warn={(x) => famachaFlag(x)} />
          </Field>
          <Field label="Body condition (1–5)" className="col-span-2" hint="1 = thin, 3 = ideal, 5 = fat">
            <Scores list={BCS} value={v.bcs} onChange={set("bcs")} testId="button-check-bcs" />
          </Field>
          <Field label="Note" className="col-span-2"><Input value={v.note} onChange={(e) => set("note")(e.target.value)} placeholder="Optional" data-testid="input-check-note" /></Field>
          <Field label="Checked by" className="col-span-2"><Input value={v.by} onChange={(e) => set("by")(e.target.value)} placeholder="Optional" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !any} data-testid="button-save-check">{busy ? "Saving…" : "Save check"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
