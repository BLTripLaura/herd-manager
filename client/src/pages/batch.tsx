import { useEffect, useMemo, useState } from "react";
import { Search, Syringe, Scale, Milk as MilkIcon, MoveRight, Check, X, AlertTriangle, ClipboardCheck } from "lucide-react";
import { BatchCare } from "@/components/batch-care";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, useApp } from "@/components/shell";
import { Field, Pick, RepeatFields, repeatPlan, MedPick } from "@/components/forms";
import { useBarnHours } from "@/components/barn-hours";
import { useList, post, today, addDays, tempNote, calcDoseMl, latestWeight, matchesAnimal, shortName, doseRuleText, invalidateAll, fmtDate , nowTime, type RepeatUnit, goatName, regName, isDrops, pillUnitOf, ORAL_UNITS, hasSide, SIDES, TUBE_AMOUNTS } from "@/lib/herd";
import { errText } from "@/pages/milk";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export default function Batch() {
  const { data: animals = [] } = useList("animals");
  const { data: weights = [] } = useList("weights");
  const { data: meds = [] } = useList("medications");
  const { data: pastures = [] } = useList("pastures");
  const { selected, setSelected, careJob } = useApp();
  const [tab, setTab] = useState(careJob ? "care" : "treat");
  useEffect(() => { if (careJob) setTab("care"); }, [careJob]);
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const active = animals.filter((a) => a.status === "active");
  const groups = Array.from(new Set(active.map((a) => a.groupName).filter(Boolean))) as string[];
  const sel = new Set(selected);
  const chosen = active.filter((a) => sel.has(a.id)).sort((a, b) => (a.tag ?? "").localeCompare(b.tag ?? "", undefined, { numeric: true }));
  const pickList = active.filter((a) => matchesAnimal(a, q));
  const toggle = (id: number) => setSelected(sel.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  /* ---- treatment ---- */
  const [medId, setMedId] = useState<string | null>(null);
  const [tDate, setTDate] = useState(today());
  const [reason, setReason] = useState("");
  const [givenBy, setGivenBy] = useState("");
  const [rows, setRows] = useState<Record<number, { w: string; dose: string; skip?: boolean; temp?: string }>>({});
  const med = meds.find((m) => String(m.id) === medId);
  const oral = med?.route === "Oral" && !isDrops(med);
  const [bUnit, setBUnit] = useState("mL");
  const pillU = oral && bUnit !== "mL" ? bUnit : null;
  const udder = med?.route === "Intramammary";
  const sided = hasSide(med?.route);
  const [bSide, setBSide] = useState<string | null>(null);
  const [bTubes, setBTubes] = useState("1");
  const unitWord = udder ? "tubes" : isDrops(med) ? "drops" : pillU ? `${pillU}s` : "mL";
  const [rTimes, setRTimes] = useState("0");
  const [rEvery, setREvery] = useState("");
  const [rUnit, setRUnit] = useState<RepeatUnit>("days");
  const [tTime, setTTime] = useState(nowTime());
  const [barnOn, setBarnOn] = useState(false);
  const { hours: barnHours } = useBarnHours();
  useEffect(() => {
    setBUnit(pillUnitOf(med) ?? "mL"); setBSide(null); setBTubes(med?.doseUnit === "tubes" && med.doseAmount === 0.5 ? "0.5" : "1");
    if (med) { setRTimes(String(med.repeatTimes ?? (med.repeatDays ? 1 : 0))); setREvery(med.repeatDays ? String(med.repeatDays) : ""); setRUnit(med.repeatUnit === "hours" ? "hours" : "days"); setBarnOn(med.repeatUnit === "hours" && ((med.repeatDays ?? 99) <= 2 || med.repeatDays === 12)); }
  }, [medId]); // eslint-disable-line
  useEffect(() => {
    setRows((prev) => {
      const next: typeof prev = {};
      for (const a of chosen) {
        const w = prev[a.id]?.w ?? String(latestWeight(a.id, weights)?.lbs ?? "");
        next[a.id] = { w, dose: String(calcDoseMl(med, Number(w)) ?? ""), skip: prev[a.id]?.skip, temp: prev[a.id]?.temp };
      }
      return next;
    });
  }, [medId, selected.join(","), weights.length]); // eslint-disable-line
  const setRow = (id: number, patch: Partial<{ w: string; dose: string; skip: boolean; temp: string }>) =>
    setRows((p) => {
      const r = { ...p[id], ...patch };
      if (patch.w !== undefined) r.dose = String(calcDoseMl(med, Number(patch.w)) ?? "");
      return { ...p, [id]: r };
    });
  const treatRows = chosen.filter((a) => !rows[a.id]?.skip);
  const totalMl = udder ? treatRows.length * (Number(bTubes) || 1) * (bSide === "Both" ? 2 : 1) : treatRows.reduce((s, a) => s + (Number(rows[a.id]?.dose) || 0), 0);

  const saveTreatments = async () => {
    if (!med) return toast({ title: "Pick a medication", variant: "destructive" });
    if (!treatRows.length) return toast({ title: "No animals to treat", variant: "destructive" });
    const times = Math.max(0, Math.floor(Number(rTimes) || 0));
    const every = Math.floor(Number(rEvery) || 0);
    if (times > 0 && every < 1) return toast({ title: "Enter the time between doses", variant: "destructive" });
    setBusy(true);
    const batchId = `B-${Date.now()}`;
    try {
      await post("/api/treatments/batch", { repeat: times > 0 ? { times, every, unit: rUnit, at: rUnit === "hours" ? repeatPlan(tDate, String(times), String(every), rUnit, tTime, barnOn ? barnHours : null).slice(1) : undefined } : undefined, treatments: treatRows.map((a) => ({
        animalId: a.id, medicationId: med.id, medName: med.name, date: tDate, time: tTime || null,
        weightLbs: Number(rows[a.id]?.w) || null, tempF: Number(rows[a.id]?.temp) || null, side: sided ? bSide : null, ...(udder ? { doseMl: null, pillCount: Number(bTubes) || 1, pillUnit: "tube" } : isDrops(med) ? { doseMl: null, drops: Math.round(Number(rows[a.id]?.dose)) || null } : pillU ? { doseMl: null, pillCount: Number(rows[a.id]?.dose) || null, pillUnit: pillU } : { doseMl: Number(rows[a.id]?.dose) || null }), route: med.route,
        reason: reason || null, givenBy: givenBy || null, batchId,
        milkClearDate: addDays(tDate, med.milkWithdrawalDays ?? 0), meatClearDate: addDays(tDate, med.meatWithdrawalDays ?? 0),
        nextDoseDate: null,
      })) });
      toast({ title: `Treated ${treatRows.length} animals`, description: `${med.name} · ${unitWord === "mL" ? `${totalMl.toFixed(1)} mL used` : `${Math.round(totalMl * 10) / 10} ${unitWord}`}${times ? ` · ${times} repeat${times > 1 ? "s" : ""} added to Today` : ""}` });
    } finally { setBusy(false); }
  };

  /* ---- weights ---- */
  const [wDate, setWDate] = useState(today());
  const [wVals, setWVals] = useState<Record<number, string>>({});
  const [wMethod, setWMethod] = useState("scale");
  const saveWeights = async () => {
    const list = chosen.filter((a) => wVals[a.id]).map((a) => ({ animalId: a.id, date: wDate, lbs: Number(wVals[a.id]), method: wMethod }));
    if (!list.length) return toast({ title: "Enter at least one weight", variant: "destructive" });
    setBusy(true);
    try { await post("/api/weights/bulk", list); setWVals({}); toast({ title: `Saved ${list.length} weights` }); } finally { setBusy(false); }
  };

  /* ---- milk ---- */
  const [mDate, setMDate] = useState(today());
  const [mOut, setMOut] = useState("1");
  const { data: milkRecs = [] } = useList("milk");
  const savedOut = (id: number) => { const m: any = milkRecs.find((x) => x.animalId === id && x.date === mDate); return m?.[`out${mOut}`] ?? null; };
  const [mVals, setMVals] = useState<Record<number, string>>({});
  const saveMilk = async () => {
    const list = chosen.filter((a) => mVals[a.id]).map((a) => ({ animalId: a.id, [`out${mOut}`]: Number(mVals[a.id]) }));
    if (!list.length) return toast({ title: "Enter at least one amount", variant: "destructive" });
    setBusy(true);
    try { await post("/api/milk/test", { date: mDate, rows: list, merge: true }); setMVals({}); toast({ title: `Saved milk-out ${mOut} for ${list.length} does`, description: `Milk test ${fmtDate(mDate)}` }); }
    catch (e) { toast({ title: "Not saved", description: errText(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  /* ---- move ---- */
  const [toPasture, setToPasture] = useState<string | null>(null);
  const moveTo = async () => {
    if (!toPasture) return;
    setBusy(true);
    try {
      const pid = toPasture === "none" ? null : Number(toPasture);
      const moved = await post("/api/animals/move", { ids: chosen.map((a) => a.id), pastureId: pid, date: today() });
      toast({ title: `Moved ${moved.length} to ${pastures.find((p) => p.id === pid)?.name ?? "Unassigned"}` });
    } finally { setBusy(false); }
  };
  const [newGroup, setNewGroup] = useState("");
  const moveGroup = async () => {
    if (!newGroup.trim()) return;
    setBusy(true);
    try {
      for (const a of chosen) await apiRequest("PATCH", `/api/animals/${a.id}`, { groupName: newGroup.trim() });
      invalidateAll();
      toast({ title: `Moved ${chosen.length} to ${newGroup}` });
    } finally { setBusy(false); }
  };

  const numInput = "h-10 w-24 text-right tabular-nums";
  const tInput = "h-10 w-16 px-2 text-right tabular-nums sm:w-24";

  return (
    <>
      <PageHeader title="Batch entry" sub="Pick goats once, then check off a job, treat, weigh, record milk or move them together." />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Picker */}
        <section className="rounded-lg border bg-card">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find animals…" className="pl-9" data-testid="input-batch-search" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pastures.map((p) => (
                <button key={`p${p.id}`} className="rounded-full border border-primary/40 bg-background px-2.5 py-1 text-xs font-medium hover-elevate" data-testid={`button-add-pasture-${p.id}`}
                  onClick={() => setSelected(Array.from(new Set([...selected, ...active.filter((a) => a.pastureId === p.id).map((a) => a.id)])))}>+ {p.name}</button>
              ))}
              {groups.map((g) => (
                <button key={g} className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium hover-elevate" data-testid={`button-add-group-${g}`}
                  onClick={() => setSelected(Array.from(new Set([...selected, ...active.filter((a) => a.groupName === g).map((a) => a.id)])))}>+ {g}</button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span data-testid="text-batch-count">{chosen.length} selected</span>
              {chosen.length > 0 && <button onClick={() => setSelected([])} className="font-medium text-primary">Clear</button>}
            </div>
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {pickList.map((a) => (
              <li key={a.id}>
                <label className={cn("flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 hover-elevate", sel.has(a.id) && "bg-accent/60")}>
                  <Checkbox checked={sel.has(a.id)} onCheckedChange={() => toggle(a.id)} data-testid={`checkbox-batch-${a.id}`} />
                  <span className="w-9 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">#{a.tag || "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{goatName(a)}</span>
                  <span className="shrink-0 text-xs capitalize text-muted-foreground">{a.sex}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        {/* Actions */}
        <section className="min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4 w-full justify-start overflow-x-auto">
              <TabsTrigger value="care" data-testid="tab-batch-care"><ClipboardCheck className="mr-1.5 h-4 w-4" />Care</TabsTrigger>
              <TabsTrigger value="treat" data-testid="tab-batch-treat"><Syringe className="mr-1.5 h-4 w-4" />Treat</TabsTrigger>
              <TabsTrigger value="weigh" data-testid="tab-batch-weigh"><Scale className="mr-1.5 h-4 w-4" />Weigh</TabsTrigger>
              <TabsTrigger value="milk" data-testid="tab-batch-milk"><MilkIcon className="mr-1.5 h-4 w-4" />Milk</TabsTrigger>
              <TabsTrigger value="move" data-testid="tab-batch-move"><MoveRight className="mr-1.5 h-4 w-4" />Move</TabsTrigger>
            </TabsList>

            {chosen.length === 0 && <div className="mb-4 rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Select animals, or tap a pasture or group to add everyone in it.</div>}

            <TabsContent value="care"><BatchCare chosen={chosen} onTreat={(ids, why) => { setSelected(ids); setReason(why); setTab("treat"); }} /></TabsContent>

            <TabsContent value="treat" className="space-y-4">
              <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
                <Field label="Medication" className="sm:col-span-2" hint={med ? `${doseRuleText(med)} · ${med.route} · milk ${med.milkWithdrawalDays}d / meat ${med.meatWithdrawalDays}d withdrawal` : undefined}>
                  <MedPick value={medId} onChange={setMedId} testId="select-batch-med" meds={meds} />
                </Field>
                {udder && <Field label="Dose"><Pick value={bTubes} onChange={setBTubes} testId="select-batch-tubes" options={TUBE_AMOUNTS} /></Field>}
                {sided && <Field label="Side"><Pick value={bSide} onChange={setBSide} testId="select-batch-side" placeholder="Left, right or both" options={SIDES} /></Field>}
                {oral && <Field label="Dose measured in" className="sm:col-span-2"><Pick value={bUnit} onChange={setBUnit} testId="select-batch-dose-unit" options={ORAL_UNITS} /></Field>}
                <Field label="Date"><Input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} /></Field>
                <Field label="Time given"><Input type="time" value={tTime} onChange={(e) => setTTime(e.target.value)} data-testid="input-batch-time" /></Field>
                <Field label="Given by"><Input value={givenBy} onChange={(e) => setGivenBy(e.target.value)} /></Field>
                <Field label="Reason" className="sm:col-span-2"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Fall deworming, CD&T booster" data-testid="input-batch-reason" /></Field>
                {med && <div className="sm:col-span-2"><RepeatFields start={tDate} times={rTimes} every={rEvery} unit={rUnit} time={tTime || "08:00"} onTimes={setRTimes} onEvery={setREvery} onUnit={setRUnit} onTime={setTTime} barnOn={barnOn} onBarnOn={setBarnOn} /></div>}
                {med && !med.vetConfirmed && <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 sm:col-span-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />This medication's dose and withdrawal haven't been marked as vet-confirmed.</div>}
              </div>
              {chosen.length > 0 && (
                <div className="overflow-hidden rounded-lg border bg-card">
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground sm:gap-3">
                    <span>Animal</span><span className="w-16 text-right sm:w-20">Temp °F</span><span className="w-16 text-right sm:w-24">Weight lb</span><span className="w-16 text-right sm:w-24">{udder ? "Tubes/side" : isDrops(med) ? "Drops" : pillU ? (pillU === "capsule" ? "Capsules" : "Tablets") : "Dose mL"}</span><span className="w-8" />
                  </div>
                  {chosen.map((a) => {
                    const r = rows[a.id] ?? { w: "", dose: "" };
                    return (
                      <div key={a.id} className={cn("grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 border-b px-3 py-2 last:border-b-0 sm:gap-3", r.skip && "opacity-40")} data-testid={`row-batch-treat-${a.id}`}>
                        <div className="min-w-0"><div className="truncate text-sm font-medium">{goatName(a)}</div><div className="text-xs text-muted-foreground">#{a.tag}{!r.w && " · no weight"}</div></div>
                        <Input className={cn(tInput, "sm:w-20", tempNote(r.temp)?.tone === "high" && "border-destructive text-destructive", tempNote(r.temp)?.tone === "low" && "border-sky-500")} inputMode="decimal" placeholder="opt." aria-label={`Temperature for ${a.name} (optional)`} value={r.temp ?? ""} onChange={(e) => setRow(a.id, { temp: e.target.value })} disabled={r.skip} data-testid={`input-batch-temp-${a.id}`} />
                        <Input className={tInput} inputMode="decimal" value={r.w} onChange={(e) => setRow(a.id, { w: e.target.value })} disabled={r.skip} data-testid={`input-batch-weight-${a.id}`} />
                        <Input className={cn(tInput, "font-semibold")} inputMode="decimal" value={udder ? (bTubes === "0.5" ? "½" : bTubes) : r.dose} onChange={(e) => setRow(a.id, { dose: e.target.value })} disabled={r.skip || udder} data-testid={`input-batch-dose-${a.id}`} />
                        <Button variant="ghost" size="icon" aria-label={r.skip ? "Include" : "Skip"} onClick={() => setRow(a.id, { skip: !r.skip })}>{r.skip ? <Check /> : <X />}</Button>
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-3 py-3">
                    <div className="text-sm">{(() => { const f = treatRows.filter((a) => tempNote(rows[a.id]?.temp)?.tone === "high").length; return f ? <span className="mr-2 font-semibold text-destructive" data-testid="text-batch-fevers">{f} with fever ·</span> : null; })()}<b className="tabular-nums" data-testid="text-batch-total">{unitWord === "mL" ? `${totalMl.toFixed(1)} mL` : `${Math.round(totalMl * 10) / 10} ${unitWord}`}</b> total for {treatRows.length} animals
                      {med && unitWord === "mL" && <span className="text-muted-foreground"> · {Math.round((med.onHandMl ?? 0) * 10) / 10} mL on hand</span>}</div>
                    <Button onClick={saveTreatments} disabled={busy || !med} data-testid="button-save-batch-treat"><Syringe />{busy ? "Saving…" : `Log ${treatRows.length} treatments`}</Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="weigh" className="space-y-4">
              <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
                <Field label="Date"><Input type="date" value={wDate} onChange={(e) => setWDate(e.target.value)} /></Field>
                <Field label="Method"><Pick value={wMethod} onChange={setWMethod} options={[{ value: "scale", label: "Scale" }, { value: "tape", label: "Weight tape" }]} /></Field>
              </div>
              {chosen.length > 0 && (
                <div className="overflow-hidden rounded-lg border bg-card">
                  {chosen.map((a) => {
                    const lw = latestWeight(a.id, weights);
                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0">
                        <div className="min-w-0"><div className="truncate text-sm font-medium">{goatName(a)}</div><div className="text-xs text-muted-foreground">#{a.tag} · last {lw ? `${lw.lbs} lb` : "—"}</div></div>
                        <Input className={numInput} inputMode="decimal" placeholder="lb" value={wVals[a.id] ?? ""} onChange={(e) => setWVals({ ...wVals, [a.id]: e.target.value })} data-testid={`input-batch-w-${a.id}`} />
                      </div>
                    );
                  })}
                  <div className="flex justify-end border-t bg-muted/30 px-3 py-3"><Button onClick={saveWeights} disabled={busy} data-testid="button-save-batch-weights"><Scale />Save weights</Button></div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="milk" className="space-y-4">
              <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
                <Field label="Test date"><Input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} data-testid="input-batch-milk-date" /></Field>
                <Field label="Milk-out"><Pick value={mOut} onChange={setMOut} testId="select-milk-out" options={[{ value: "1", label: "Milk-out 1" }, { value: "2", label: "Milk-out 2" }, { value: "3", label: "Milk-out 3" }]} /></Field>
                <p className="basis-full text-xs text-muted-foreground">Up to 2 test days a month. Each milk-out is added to that day's test for each doe.</p>
              </div>
              {chosen.length > 0 && (
                <div className="overflow-hidden rounded-lg border bg-card">
                  {chosen.filter((a) => a.sex === "doe").map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0">
                      <div className="truncate text-sm font-medium">{goatName(a)} <span className="text-xs text-muted-foreground">#{a.tag}</span></div>
                      <div className="flex items-center gap-2">
                        {savedOut(a.id) !== null && mVals[a.id] === undefined && <span className="text-xs text-muted-foreground">saved</span>}
                        <Input className={numInput} inputMode="decimal" placeholder={savedOut(a.id) !== null ? String(savedOut(a.id)) : "lb"} value={mVals[a.id] ?? ""} onChange={(e) => setMVals({ ...mVals, [a.id]: e.target.value })} data-testid={`input-batch-milk-${a.id}`} />
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end border-t bg-muted/30 px-3 py-3"><Button onClick={saveMilk} disabled={busy} data-testid="button-save-batch-milk"><MilkIcon />Save milk</Button></div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="move" className="space-y-4">
              <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
                <Field label="Move selected to pasture" className="min-w-56 flex-1">
                  <Pick value={toPasture} onChange={setToPasture} testId="select-move-pasture" options={[...pastures.map((p) => ({ value: String(p.id), label: p.name })), { value: "none", label: "Unassigned" }]} />
                </Field>
                <Button onClick={moveTo} disabled={busy || !chosen.length || !toPasture} data-testid="button-move-pasture"><MoveRight />Move {chosen.length}</Button>
              </div>
              <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
                <Field label="Change group" className="min-w-56 flex-1">
                  <Input list="grouplist" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Pick or type a new group" data-testid="input-move-group" />
                  <datalist id="grouplist">{groups.map((g) => <option key={g} value={g} />)}</datalist>
                </Field>
                <Button onClick={moveGroup} disabled={busy || !chosen.length || !newGroup.trim()} data-testid="button-move-group"><MoveRight />Move {chosen.length}</Button>
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </>
  );
}
