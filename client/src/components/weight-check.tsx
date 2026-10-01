import { Check, Scale } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { weighedText, weightChanged, type Weight } from "@/lib/herd";

/** Is this weight good to dose from? Either a new weight was typed in, or the one on file was confirmed. */
export const weightOk = (lbs: any, lw: Weight | undefined, confirmed: boolean) => Number(lbs) > 0 && (weightChanged(lbs, lw) || (confirmed && !!lw));

/**
 * Weight used for a dose. The stored weight is filled in, but it has to be confirmed
 * ("Still correct") or replaced with today's weight before the dose can be saved.
 */
export function WeightCheck({ lbs, onLbs, lw, confirmed, onConfirmed, required = true, testId = "weight", canTypeDose = true }: {
  lbs: any; onLbs: (v: string) => void; lw?: Weight; confirmed: boolean; onConfirmed: (v: boolean) => void; required?: boolean; testId?: string; canTypeDose?: boolean;
}) {
  const changed = weightChanged(lbs, lw);
  const ok = weightOk(lbs, lw, confirmed);
  const tone = !required ? "border-border" : ok ? "border-emerald-500/60 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-amber-400 bg-amber-50 dark:bg-amber-950/30";
  return (
    <div className={cn("rounded-md border px-3 py-2", tone)} data-testid={`box-${testId}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor={`input-${testId}`}><Scale className="h-3.5 w-3.5 text-muted-foreground" />Weight (lb)</label>
        {required && (ok
          ? <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300" data-testid={`text-${testId}-ok`}><Check className="h-3.5 w-3.5" />{changed ? "New weight, will be saved" : "Checked"}</span>
          : <span className="text-xs font-semibold text-amber-800 dark:text-amber-200" data-testid={`text-${testId}-needed`}>Check weight</span>)}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <Input id={`input-${testId}`} className="h-9 w-28 bg-background" type="number" inputMode="decimal" step="0.1" value={lbs ?? ""} onChange={(e) => { onLbs(e.target.value); onConfirmed(false); }} data-testid={`input-${testId}`} />
        {lw && !changed && (
          <Button type="button" size="sm" variant={confirmed ? "secondary" : "outline"} className="h-9" onClick={() => onConfirmed(!confirmed)} data-testid={`button-${testId}-confirm`}>
            {confirmed ? <><Check />Still correct</> : "Still correct"}
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        On file: {weighedText(lw)}.{" "}
        {required ? (lw ? `Tap Still correct, or type today's weight and it will be saved.${canTypeDose ? " Typing the dose yourself also works." : ""}` : `Enter the goat's weight to work out the dose (it will be saved)${canTypeDose ? ", or type the dose yourself" : ""}.`) : "Optional here."}
      </p>
    </div>
  );
}
