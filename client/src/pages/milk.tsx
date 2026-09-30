import { useEffect, useMemo, useState } from "react";
import { Milk as MilkIcon, AlertTriangle, Plus, Trash2, CalendarDays } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, Empty, Stat } from "@/components/shell";
import {
  useList, post, today, fmtDate, fmtShort, activeHolds, shortName, invalidateAll, milkTestDates, testsInMonth, monthName,
  MAX_TESTS_PER_MONTH, MILK_OUTS, daysBetween, goatName, regName } from "@/lib/herd";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export const errText = (e: unknown) => {
  const m = String((e as Error)?.message ?? e).replace(/^\d{3}:\s*/, "");
  try { return JSON.parse(m).message ?? m; } catch { return m; }
};
const r1 = (n: number) => Math.round(n * 10) / 10;

export default function MilkPage() {
  const { data: animals = [] } = useList("animals");
  const { data: milk = [] } = useList("milk");
  const { data: treatments = [] } = useList("treatments");
  const { toast } = useToast();
  const tests = useMemo(() => milkTestDates(milk), [milk]);
  const [date, setDate] = useState(tests[0] ?? today());
  const [landed, setLanded] = useState(tests.length > 0);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  // open on the most recent test once records arrive
  useEffect(() => { if (!landed && tests.length) { setDate(tests[0]); setLanded(true); } }, [tests.length]); // eslint-disable-line

  const { data: lactations = [] } = useList("lactations");
  const onDay = milk.filter((m) => m.date === date);
  const recordedIds = new Set(onDay.map((m) => m.animalId));
  const does = animals
    .filter((a) => a.sex === "doe" && ((a.status === "active" && a.inMilk) || recordedIds.has(a.id)))
    .sort((a, b) => (a.tag ?? "").localeCompare(b.tag ?? "", undefined, { numeric: true }));
  const holds = activeHolds(treatments, animals);

  useEffect(() => {
    const v: Record<string, string> = {};
    for (const m of onDay) for (const n of MILK_OUTS) { const x = (m as any)[`out${n}`]; if (x !== null && x !== undefined) v[`${m.animalId}-${n}`] = String(x); }
    setVals(v);
  }, [date, milk]); // eslint-disable-line

  const isTest = tests.includes(date);
  const monthTests = testsInMonth(milk, date.slice(0, 7));
  const monthFull = !isTest && monthTests.length >= MAX_TESTS_PER_MONTH;
  const thisMonth = testsInMonth(milk, today().slice(0, 7));

  const totalFor = (id: number) => MILK_OUTS.reduce((s, n) => s + (Number(vals[`${id}-${n}`]) || 0), 0);
  const enteredTotal = does.reduce((s, a) => s + totalFor(a.id), 0);
  const tested = does.filter((a) => totalFor(a.id) > 0).length;

  const lastDate = tests[0];
  const last = milk.filter((m) => m.date === lastDate);
  const lastTotal = last.reduce((s, m) => s + m.lbs, 0);

  const series = useMemo(() => tests.slice(0, 12).reverse().map((d) => {
    const rows = milk.filter((m) => m.date === d);
    return { date: fmtShort(d), avg: rows.length ? r1(rows.reduce((s, m) => s + m.lbs, 0) / rows.length) : 0 };
  }), [milk, tests]);

  const save = async () => {
    setBusy(true);
    try {
      const rows = does.map((a) => {
        const r: Record<string, number | null> = { animalId: a.id };
        for (const n of MILK_OUTS) { const v = vals[`${a.id}-${n}`]; r[`out${n}`] = v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v); }
        return r;
      });
      await post("/api/milk/test", { date, rows });
      toast({ title: "Milk test saved", description: `${fmtDate(date)} · ${tested} does · ${enteredTotal.toFixed(1)} lb` });
    } catch (e) {
      toast({ title: "Not saved", description: errText(e), variant: "destructive" });
    } finally { setBusy(false); }
  };
  const remove = async () => {
    await apiRequest("DELETE", `/api/milk/test/${date}`); invalidateAll();
    toast({ title: "Milk test deleted", description: fmtDate(date) });
    setDate(tests.find((d) => d !== date) ?? today());
  };

  const outCols = "grid-cols-[minmax(0,1fr)_repeat(3,60px)] sm:grid-cols-[minmax(0,1fr)_repeat(3,76px)_64px]";

  return (
    <>
      <PageHeader title="Milk test" sub={`Up to ${MAX_TESTS_PER_MONTH} test days a month, 3 milk-outs per doe.`} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Last test" value={lastDate ? `${lastTotal.toFixed(1)} lb` : "—"} hint={lastDate ? `${fmtDate(lastDate)} · herd total` : "No tests yet"} />
        <Stat label="Average per doe" value={last.length ? `${(lastTotal / last.length).toFixed(1)} lb` : "—"} hint="last test day" />
        <Stat label={`Tests in ${monthName(today())}`} value={`${thisMonth.length} of ${MAX_TESTS_PER_MONTH}`} hint={thisMonth.length ? thisMonth.slice().reverse().map(fmtShort).join(" · ") : "None yet"} />
        <Stat label="Does in milk" value={animals.filter((a) => a.status === "active" && a.sex === "doe" && a.inMilk).length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="rounded-lg border bg-card lg:col-span-3">
          <div className="space-y-3 border-b p-3">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-44" data-testid="input-milk-date" />
              {!tests.includes(today()) && date !== today() && thisMonth.length < MAX_TESTS_PER_MONTH && (
                <Button variant="outline" size="sm" onClick={() => setDate(today())} data-testid="button-new-test"><Plus />New test today</Button>
              )}
              <span className={cn("text-xs font-medium", isTest ? "text-muted-foreground" : "text-primary")} data-testid="text-test-state">
                {isTest ? "Editing saved test" : "New test day"}
              </span>
            </div>
            {tests.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Recent test days">
                {tests.slice(0, 8).map((d) => (
                  <button key={d} onClick={() => setDate(d)} data-testid={`chip-test-${d}`}
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium hover-elevate", d === date ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>
                    {fmtShort(d)}
                  </button>
                ))}
              </div>
            )}
            {monthFull && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="text-month-full">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{monthName(date)} already has {MAX_TESTS_PER_MONTH} milk tests ({monthTests.slice().reverse().map(fmtShort).join(" and ")}). Pick one of those dates to edit it.</span>
              </div>
            )}
          </div>
          {does.length === 0 ? <div className="p-4"><Empty icon={MilkIcon} title="No does marked in milk">Edit a doe and switch on "Currently in milk".</Empty></div> : (
            <>
              <div className={cn("grid gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground", outCols)}>
                <span>Doe</span>
                {MILK_OUTS.map((n) => <span key={n} className="text-right">Out {n}</span>)}
                <span className="hidden text-right sm:block">Total</span>
              </div>
              {does.map((a) => {
                const hold = holds.milk.get(a.id);
                const tot = totalFor(a.id);
                return (
                  <div key={a.id} className={cn("grid items-center gap-2 border-b px-3 py-2", outCols)} data-testid={`row-milk-${a.id}`}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{goatName(a)}</div>
                      <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                        <span>#{a.tag}</span>
                        {(() => { const l = lactations.find((x) => x.animalId === a.id && x.startDate <= date && (!x.endDate || x.endDate >= date)); return l ? <span className="tabular-nums">· DIM {daysBetween(l.startDate, date) + 1}</span> : null; })()}
                        {a.milkStatus === "mastitis" && <span className="font-semibold text-destructive">· Mastitis</span>}
                        {a.milkStatus === "drying" && <span className="font-semibold text-amber-700 dark:text-amber-300">· Drying up</span>}
                        <span className="tabular-nums sm:hidden">{tot ? `· ${tot.toFixed(1)} lb` : ""}</span>
                        {hold && <span className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3 w-3" />hold to {fmtShort(hold.milkClearDate)}</span>}
                      </div>
                    </div>
                    {MILK_OUTS.map((n) => (
                      <Input key={n} inputMode="decimal" aria-label={`${goatName(a)} milk-out ${n}`} className="h-10 px-2 text-right tabular-nums" value={vals[`${a.id}-${n}`] ?? ""} placeholder="—"
                        disabled={monthFull} onChange={(e) => setVals({ ...vals, [`${a.id}-${n}`]: e.target.value })} data-testid={`input-milk-${a.id}-${n}`} />
                    ))}
                    <span className="hidden text-right text-sm font-semibold tabular-nums sm:block" data-testid={`text-milk-total-${a.id}`}>{tot ? tot.toFixed(1) : "—"}</span>
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="text-sm text-muted-foreground">{tested} of {does.length} does · <span className="font-semibold text-foreground tabular-nums">{enteredTotal.toFixed(1)} lb</span></span>
                <div className="flex gap-2">
                  {isTest && <Button variant="outline" onClick={() => setConfirmDel(true)} data-testid="button-delete-test"><Trash2 />Delete test</Button>}
                  <Button onClick={save} disabled={busy || monthFull} data-testid="button-save-milk"><MilkIcon />{busy ? "Saving…" : "Save test"}</Button>
                </div>
              </div>
            </>
          )}
        </section>
        <section className="rounded-lg border bg-card p-4 lg:col-span-2">
          <h2 className="text-sm font-bold">Average per doe, by test day</h2>
          <p className="mb-3 text-xs text-muted-foreground">Last {series.length || 0} tests · lb per doe per test day</p>
          {series.length === 0 ? <Empty icon={MilkIcon} title="No tests yet">Save your first test day to see the trend.</Empty> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} width={32} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted))" }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="avg" name="lb per doe" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the {fmtDate(date)} milk test?</AlertDialogTitle>
            <AlertDialogDescription>This removes all milk-outs recorded that day for every doe ({onDay.length} records).</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} data-testid="button-confirm-delete-test">Delete test</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
