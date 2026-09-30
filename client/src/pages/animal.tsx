import { CalfProStatus } from "@/components/calf-pro";
import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronRight, Users, Flame, Pencil, Syringe, Scale, Heart, Trash2, AlertTriangle, Milk as MilkIcon, Plus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Empty } from "@/components/shell";
import { AnimalDialog, TreatDialog, BreedingDialog, Pick, PedigreeLink, HeatDialog } from "@/components/forms";
import { GiveDoseDialog } from "@/components/give-dose";
import { ProfilePhoto, PhotoGallery } from "@/components/photos";
import { ShowsTab, NotesTab } from "@/components/shows-notes";
import { CareTab } from "@/components/batch-care";
import { PedigreeChart } from "@/components/pedigree";
import { RegistrationPapers } from "@/components/papers";
import { MilkBadge, MilkStatusDialog, LactationList } from "@/components/milk-status";
import { isCalfPro, useList, useSave, useRemove, post, type Task, latestWeight, activeHolds, age, fmtDate, fmtShort, today, relDays, shortName, fmtChip, HORN_LABEL, progenyOf, findByName, normName, daysBetween, heatWatch, heatDates, heatInterval, HEAT_TYPICAL, type Breeding, type Animal, type Heat, usDue, prekidDue, daysInMilk , nextDoses, doseLate, fmtTime, goatName, regName, doseText, everyText, taskDoseText } from "@/lib/herd";

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="break-words text-sm font-medium">{value || "—"}</div></div>;
}

export default function AnimalPage() {
  const [, params] = useRoute("/animal/:id");
  const id = Number(params?.id);
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [photoOpen, setPhotoOpen] = useState<number | null>(null);
  const { data: animals, isLoading } = useList("animals");
  const { data: weights = [] } = useList("weights");
  const { data: treatments = [] } = useList("treatments");
  const { data: allShows = [] } = useList("shows");
  const { data: allNotes = [] } = useList("animalNotes");
  const { data: breedings = [] } = useList("breedings");
  const { data: milk = [] } = useList("milk");
  const { data: tasks = [] } = useList("tasks");
  const { data: pastures = [] } = useList("pastures");
  const { data: lactations = [] } = useList("lactations");
  const [milkDlg, setMilkDlg] = useState(false);
  const [giving, setGiving] = useState<Task | null>(null);
  const [tLimit, setTLimit] = useState(50); // long histories (EasyKeeper import) show 50 at a time
  const saveWeight = useSave("weights");
  const removeAnimal = useRemove("animals");
  const removeTreatment = useRemove("treatments");
  const removeWeight = useRemove("weights");
  const [editing, setEditing] = useState(false);
  const [treating, setTreating] = useState(false);
  const [breedOpen, setBreedOpen] = useState<{ open: boolean; b?: Breeding }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState("treatments");
  const { data: heats = [] } = useList("heats");
  const [heatDlg, setHeatDlg] = useState<{ open: boolean; h?: Heat }>({ open: false });
  const [wLbs, setWLbs] = useState("");
  const [wDate, setWDate] = useState(today());

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  const a = animals?.find((x) => x.id === id);
  if (!a) return <Empty icon={AlertTriangle} title="Animal not found"><Link href="/herd" className="text-primary">Back to herd</Link></Empty>;

  const myW = weights.filter((w) => w.animalId === id).sort((x, y) => x.date.localeCompare(y.date));
  const lw = latestWeight(id, weights);
  const myAllT = treatments.filter((t) => t.animalId === id).sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id);
  const myT = myAllT.filter((t) => !isCalfPro(t.medName)); // Calf-Pro has its own section
  const myCalfPro = myAllT.filter((t) => isCalfPro(t.medName));
  const myB = breedings.filter((b) => b.doeId === id).sort((x, y) => y.date.localeCompare(x.date));
  const myM = milk.filter((m) => m.animalId === id);
  const holds = activeHolds(treatments, animals ?? []);
  const mh = holds.milk.get(id), meh = holds.meat.get(id);
  const scheduled = tasks.filter((k) => !k.done && k.kind === "dose" && String(k.animalIds || k.animalId || "").split(",").map(Number).includes(id))
    .sort((x, y) => x.dueDate.localeCompare(y.dueDate) || (x.dueTime ?? "").localeCompare(y.dueTime ?? ""));
  const offspring = progenyOf(a, animals!).sort((x, y) => (y.dob ?? "").localeCompare(x.dob ?? "") || x.name.localeCompare(y.name));
  const inHerd = offspring.filter((k) => k.status === "active").length;
  const byYear = offspring.reduce<[string, Animal[]][]>((acc, k) => {
    const yr = k.dob ? k.dob.slice(0, 4) : "Birth date unknown";
    const g = acc.find(([y]) => y === yr); g ? g[1].push(k) : acc.push([yr, [k]]); return acc;
  }, []);
  const parentLink = (name?: string | null) => {
    if (!name) return null;
    const p = findByName(name, animals!);
    return p
      ? <><Link href={`/animal/${p.id}`} className="text-primary hover:underline" data-testid="link-parent">{goatName(p)}</Link>{p.status !== "active" && <span className="ml-1 text-xs capitalize text-muted-foreground">({p.status})</span>}</>
      : <>{name}</>;
  };
  const showProgeny = () => { setTab("kids"); setTimeout(() => document.getElementById("animal-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };

  const myTests = [...myM].sort((x, y) => x.date.localeCompare(y.date));
  const milkByDay = myTests.slice(-24).map((m) => ({ date: fmtShort(m.date), lbs: Math.round(m.lbs * 10) / 10 }));
  const lastTest = myTests[myTests.length - 1];

  const addWeight = async () => {
    if (!wLbs) return;
    await saveWeight.mutateAsync({ animalId: id, date: wDate, lbs: Number(wLbs), method: "scale" });
    setWLbs(""); toast({ title: "Weight saved", description: `${wLbs} lb` });
  };

  return (
    <>
      <button onClick={() => (window.history.length > 1 ? window.history.back() : nav("/herd"))} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="button-back"><ArrowLeft className="h-4 w-4" />Back</button>

      <div className="mb-6 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <ProfilePhoto animal={a} onOpen={setPhotoOpen} />
            <div className="min-w-0">
              {a.barnName && <div className="truncate text-xl font-bold tracking-tight" data-testid="text-barn-name">{a.barnName}</div>}
              <h1 className={a.barnName ? "truncate text-sm font-medium text-muted-foreground" : "truncate text-xl font-bold tracking-tight"} data-testid="text-animal-name">{a.name}</h1>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {a.tag && <Badge className="tabular-nums" data-testid="badge-tag">Tag {a.tag}</Badge>}
                <Badge variant="secondary" className="capitalize">{a.sex}</Badge>
                {a.status !== "active" && <Badge variant="outline" className="capitalize">{a.status}</Badge>}
                {a.sex === "doe" && a.milkStatus && <button onClick={() => setMilkDlg(true)} aria-label="Change milk status"><MilkBadge status={a.milkStatus} className="cursor-pointer" /></button>}
                {a.groupName && <Badge variant="outline">{a.groupName}</Badge>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="button-edit-animal"><Pencil />Edit</Button>
            <Button size="sm" onClick={() => setTreating(true)} data-testid="button-treat"><Syringe />Log treatment</Button>
          </div>
        </div>

        {a.status !== "active" && (
          <button onClick={() => setEditing(true)} className="mt-4 block w-full rounded-md border bg-muted/40 px-3 py-2 text-left text-sm hover-elevate" data-testid="status-card">
            <div className="font-semibold">{a.status === "sold" ? "Sold" : "Deceased"}{a.statusDate ? ` ${fmtDate(a.statusDate)}` : ""}{a.status === "sold" && a.salePrice != null ? ` · $${a.salePrice.toLocaleString("en-US", { minimumFractionDigits: a.salePrice % 1 ? 2 : 0 })}` : ""}</div>
            {a.status === "sold" ? (
              (a.buyerName || a.buyerPhone || a.buyerEmail || a.buyerAddress)
                ? <div className="mt-0.5 text-muted-foreground"><span className="text-foreground">Buyer: {a.buyerName || "—"}</span>{a.buyerPhone && <> · {a.buyerPhone}</>}{a.buyerEmail && <> · {a.buyerEmail}</>}{a.buyerAddress && <div className="whitespace-pre-line">{a.buyerAddress}</div>}</div>
                : <div className="mt-0.5 text-muted-foreground">No buyer details yet. Tap to add them.</div>
            ) : (
              a.deathCause ? <div className="mt-0.5 whitespace-pre-line text-muted-foreground"><span className="text-foreground">Cause:</span> {a.deathCause}</div>
                : <div className="mt-0.5 text-muted-foreground">No cause of death noted yet. Tap to add it.</div>
            )}
          </button>
        )}

        {(mh || meh) && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="status-withdrawal">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{mh && <div><b>Milk hold</b> until {fmtDate(mh.milkClearDate)} ({mh.medName})</div>}{meh && <div><b>Meat hold</b> until {fmtDate(meh.meatClearDate)}</div>}</div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Pasture</div>
            <div className="mt-0.5 max-w-52">
              <Pick value={a.pastureId ? String(a.pastureId) : "none"} testId="select-animal-pasture"
                onChange={async (v) => { const p = v === "none" ? null : Number(v); await post("/api/animals/move", { ids: [id], pastureId: p, date: today() }); toast({ title: `Moved to ${pastures.find((x) => x.id === p)?.name ?? "Unassigned"}` }); }}
                options={[...pastures.map((p) => ({ value: String(p.id), label: p.name })), { value: "none", label: "Unassigned" }]} />
            </div>
          </div>
          <Info label="ADGA reg #" value={<>{a.regNumber || "—"}{a.pedigreeUrl && <div><PedigreeLink url={a.pedigreeUrl} /></div>}</>} />
          <Info label="Born" value={a.dob ? `${fmtDate(a.dob)} · ${age(a.dob)}` : null} />
          <Info label="Latest weight" value={lw ? `${lw.lbs} lb · ${fmtShort(lw.date)}` : null} />
          <Info label="Breed" value={a.breed} />
          <Info label="Herdbook" value={a.herdbook} />
          <Info label="Ear type" value={a.earType} />
          <Info label="Color" value={a.color} />
          <Info label="Eye color" value={a.eyeColor || "Brown"} />
          <Info label="Horn status" value={HORN_LABEL[a.hornStatus ?? "disbudded"] ?? a.hornStatus} />
          <Info label={`Tattoo · ${a.tattooLocation === "tail" ? "Tail" : "Ear"}`} value={a.tattooRight || a.tattooLeft ? <span className="flex flex-wrap gap-x-3" data-testid="text-tattoo"><span><span className="text-xs font-normal text-muted-foreground">Right </span>{a.tattooRight || "—"}</span><span><span className="text-xs font-normal text-muted-foreground">Left </span>{a.tattooLeft || "—"}</span></span> : null} />
          <Info label={a.microchip ? `Microchip · ${a.chipLocation === "tail" ? "Tail" : "Base of ear"}` : "Microchip"} value={a.microchip ? <span className="font-mono text-[13px] tabular-nums" data-testid="text-microchip">{fmtChip(a.microchip)}</span> : <span className="font-normal text-muted-foreground" data-testid="text-microchip-none">&nbsp;</span>} />
          <Info label="Sire" value={parentLink(a.sire)} />
          <Info label="Dam" value={parentLink(a.dam)} />
          {a.sex === "doe" && <div>
            <div className="text-xs text-muted-foreground">Milk status</div>
            <button onClick={() => setMilkDlg(true)} className="mt-0.5 text-left text-sm font-semibold hover:text-primary" data-testid="button-milk-status">
              {a.milkStatus ? ({ milking: "In milk", mastitis: "Mastitis", drying: "Drying up", dry: "Dry" } as any)[a.milkStatus] : "Not fresh yet"}
              <span className="ml-1 text-xs font-normal text-primary underline-offset-2 hover:underline">Change</span>
              {(() => { const d = daysInMilk(a.id, lactations); return <div className="text-xs font-normal text-muted-foreground" data-testid="text-dim">{d.current !== null ? `Day ${d.current} in milk · ` : ""}{d.total} lifetime days</div>; })()}
            </button>
          </div>}
          {a.sex === "doe" && <Info label="Last milk test" value={lastTest ? `${lastTest.lbs.toFixed(1)} lb · ${fmtShort(lastTest.date)}` : null} />}
          <Info label="Progeny" value={offspring.length
            ? <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                {offspring.slice(0, 4).map((k) => <Link key={k.id} href={`/animal/${k.id}`} className="text-primary hover:underline" data-testid={`link-kid-${k.id}`}>{goatName(k)}</Link>)}
                <button onClick={showProgeny} className="text-xs font-normal text-muted-foreground hover:text-primary hover:underline" data-testid="button-view-progeny">{offspring.length > 4 ? `+${offspring.length - 4} more · ` : ""}{inHerd} of {offspring.length} in herd</button>
              </span>
            : null} />
        </div>
        {a.notes && <p className="mt-4 text-sm text-muted-foreground">{a.notes}</p>}
      </div>

      <div className="mb-6"><PhotoGallery animal={a} openId={photoOpen} setOpenId={setPhotoOpen} /></div>
      <div className="mb-6"><RegistrationPapers animal={a} /></div>

      <Tabs value={tab} onValueChange={setTab} id="animal-tabs" className="scroll-mt-20">
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-y-1">
          <TabsTrigger value="treatments" data-testid="tab-treatments">Treatments</TabsTrigger>
          <TabsTrigger value="weights" data-testid="tab-weights">Weights</TabsTrigger>
          {a.sex === "doe" && <TabsTrigger value="breeding" data-testid="tab-breeding">Breeding</TabsTrigger>}
          {a.sex === "doe" && <TabsTrigger value="milk" data-testid="tab-milk">Milk</TabsTrigger>}
          <TabsTrigger value="care" data-testid="tab-care">Care</TabsTrigger>
          <TabsTrigger value="kids" data-testid="tab-progeny">Progeny{offspring.length ? ` (${offspring.length})` : ""}</TabsTrigger>
          <TabsTrigger value="shows" data-testid="tab-shows">Shows{(() => { const n = allShows.filter((x) => x.animalId === id).length; return n ? ` (${n})` : ""; })()}</TabsTrigger>
          <TabsTrigger value="other" data-testid="tab-other">Other{(() => { const n = allNotes.filter((x) => x.animalId === id).length; return n ? ` (${n})` : ""; })()}</TabsTrigger>
        </TabsList>

        <TabsContent value="treatments">
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setTreating(true)} data-testid="button-add-treatment"><Syringe />Log treatment</Button>
          </div>
          {scheduled.length > 0 && (
            <div className="mb-3 rounded-lg border bg-card" data-testid="card-scheduled-doses">
              <div className="border-b px-4 py-2.5 text-xs font-semibold text-muted-foreground">Scheduled doses</div>
              <ul className="divide-y">
                {nextDoses(scheduled).map(({ task: k, remaining, last }) => (
                  <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0"><div className="truncate text-sm font-medium">{k.doseNo ? `Dose ${k.doseNo} of ${k.doseTotal} · ` : ""}{k.title.split(" — ")[0]}{k.doseNo ? "" : [taskDoseText(k), everyText(k.repeatEvery)].filter(Boolean).map((x) => ` · ${x}`).join("")}</div><div className={`text-xs ${doseLate(k) ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{fmtShort(k.dueDate)}{k.dueTime ? ` ${fmtTime(k.dueTime)}` : ""} · {doseLate(k) ? "overdue" : relDays(k.dueDate)}{remaining ? ` · then ${remaining} more, last ${fmtShort(last.dueDate)}${last.dueTime ? ` ${fmtTime(last.dueTime)}` : ""}` : ""}</div></div>
                    <Button size="sm" variant={k.dueDate <= today() ? "default" : "outline"} onClick={() => setGiving(k)} data-testid={`button-give-${k.id}`}>{k.dueDate <= today() ? "Give" : "Log"}</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <CalfProStatus animalId={id} />
          {myCalfPro.length > 0 && (
            <details className="mb-3 rounded-lg border bg-card" data-testid="card-calfpro-history">
              <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-muted-foreground">Calf-Pro · {new Set(myCalfPro.map((t) => t.date)).size} day{new Set(myCalfPro.map((t) => t.date)).size === 1 ? "" : "s"}, {fmtShort(myCalfPro[myCalfPro.length - 1].date)} to {fmtShort(myCalfPro[0].date)}</summary>
              <ul className="divide-y border-t text-xs">
                {myCalfPro.map((t) => <li key={t.id} className="px-4 py-2">{fmtDate(t.date)}{t.time ? ` ${fmtTime(t.time)}` : ""}{t.doseMl ? ` · ${t.doseMl} mL` : ""}{t.givenBy ? ` · ${t.givenBy}` : ""}</li>)}
              </ul>
            </details>
          )}
          {myT.length === 0 ? <Empty icon={Syringe} title="No treatments logged">Use Log treatment to record a medication, dose and withdrawal for this goat.</Empty> : (
            <ul className="overflow-hidden rounded-lg border bg-card">
              {myT.slice(0, tLimit).map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 border-b px-4 py-3 last:border-b-0" data-testid={`row-treatment-${t.id}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{t.medName}{t.doseTotal ? <span className="ml-1.5 font-normal text-muted-foreground">dose {t.doseNo} of {t.doseTotal}</span> : null}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(t.date)}{t.time ? ` ${fmtTime(t.time)}` : ""}{doseText(t) ? ` · ${doseText(t)} ${t.route ?? ""}` : ""}{t.weightLbs ? ` · at ${t.weightLbs} lb` : ""}{t.tempF ? ` · temp ${t.tempF} °F` : ""}{t.reason ? ` · ${t.reason}` : ""}{t.givenBy ? ` · ${t.givenBy}` : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      {t.milkClearDate && t.milkClearDate > t.date && <Badge variant="outline" className={t.milkClearDate > today() ? "border-amber-400" : ""}>Milk clear {fmtShort(t.milkClearDate)}</Badge>}
                      {t.meatClearDate && t.meatClearDate > t.date && <Badge variant="outline">Meat clear {fmtShort(t.meatClearDate)}</Badge>}
                      {t.batchId?.startsWith("B-") && <Badge variant="secondary">Batch</Badge>}
                      {t.batchId?.startsWith("EK-") && <Badge variant="secondary">EasyKeeper</Badge>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Delete treatment" onClick={() => removeTreatment.mutate(t.id)} data-testid={`button-delete-treatment-${t.id}`}><Trash2 /></Button>
                </li>
              ))}
              {myT.length > tLimit && (
                <li className="px-4 py-2.5 text-center">
                  <Button variant="ghost" size="sm" onClick={() => setTLimit(tLimit + 100)} data-testid="button-more-treatments">Show more ({myT.length - tLimit} older)</Button>
                </li>
              )}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="weights" className="space-y-4">
          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
            <Input type="number" inputMode="decimal" placeholder="Weight (lb)" value={wLbs} onChange={(e) => setWLbs(e.target.value)} className="w-36" data-testid="input-weight" />
            <Input type="date" value={wDate} onChange={(e) => setWDate(e.target.value)} className="w-40" />
            <Button onClick={addWeight} disabled={!wLbs || saveWeight.isPending} data-testid="button-add-weight"><Scale />Add weight</Button>
          </div>
          {myW.length > 1 && (
            <div className="h-56 rounded-lg border bg-card p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={myW.map((w) => ({ date: fmtShort(w.date), lbs: w.lbs }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} width={36} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="lbs" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {myW.length === 0 ? <Empty icon={Scale} title="No weights yet">Weights drive the dose calculator, so add one before treating.</Empty> : (
            <ul className="overflow-hidden rounded-lg border bg-card">
              {[...myW].reverse().map((w) => (
                <li key={w.id} className="flex items-center justify-between border-b px-4 py-2.5 last:border-b-0">
                  <span className="text-sm">{fmtDate(w.date)}</span>
                  <span className="flex items-center gap-2 text-sm font-semibold tabular-nums">{w.lbs} lb<span className="text-xs font-normal text-muted-foreground">{w.method}</span>
                    <Button variant="ghost" size="icon" aria-label="Delete weight" onClick={() => removeWeight.mutate(w.id)}><Trash2 /></Button></span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="breeding" className="space-y-4">
          {(() => {
            const myH = heats.filter((h) => h.doeId === id).sort((x, y) => y.date.localeCompare(x.date));
            const w = heatWatch([a], heats, breedings).items[0];
            const cyc = heatInterval(heatDates(id, heats, breedings).map((d) => d.date));
            return (
              <div className="rounded-lg border bg-card" data-testid="card-heat">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold">Heat cycle</div>
                    <div className="text-xs text-muted-foreground">
                      {cyc.personal ? `Her average: ${cyc.interval} days (${cyc.cycles} cycle${cyc.cycles === 1 ? "" : "s"})` : `Typical ${HEAT_TYPICAL}-day cycle until two heats are logged`}
                      {w && w.state !== "check" && <> · next about <span className="font-semibold text-foreground">{fmtShort(w.next)}</span> (watch {fmtShort(w.windowStart)}–{fmtShort(w.windowEnd)})</>}
                      {w?.state === "return" && <> · watching for return heat</>}
                      {w?.state === "check" && <> · no return heat seen, confirm pregnancy</>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setHeatDlg({ open: true })} data-testid="button-log-heat-animal"><Flame />Log heat</Button>
                </div>
                {myH.length ? (
                  <ul>
                    {myH.slice(0, 6).map((h, i) => {
                      const prev = myH[i + 1];
                      return (
                        <li key={h.id} className="border-b last:border-b-0">
                          <button onClick={() => setHeatDlg({ open: true, h })} className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover-elevate">
                            <span className="min-w-0 truncate">{fmtDate(h.date)} <span className="text-xs text-muted-foreground">{h.signs ? `· ${h.signs.split(",").join(", ")}` : ""}</span></span>
                            <span className="shrink-0 text-xs text-muted-foreground"><span className="capitalize">{h.strength}</span>{prev ? ` · ${daysBetween(prev.date, h.date)} d` : ""}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : <div className="px-4 py-3 text-xs text-muted-foreground">No heats logged yet.</div>}
              </div>
            );
          })()}
          <Button onClick={() => setBreedOpen({ open: true })} data-testid="button-add-breeding"><Heart />Record breeding</Button>
          {myB.length === 0 ? <Empty icon={Heart} title="No breedings recorded" /> : (
            <ul className="overflow-hidden rounded-lg border bg-card">
              {myB.map((b) => (
                <li key={b.id}>
                  <button className="flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left hover-elevate" onClick={() => setBreedOpen({ open: true, b })}>
                    <div><div className="text-sm font-semibold">Bred to {shortName(b.buck)}</div><div className="text-xs text-muted-foreground">{fmtDate(b.date)} · {b.method}{b.buckSource === "frozen" && b.straws ? ` · ${b.straws} straw${b.straws === 1 ? "" : "s"}` : ""}{b.buckSource === "guest" ? " · guest buck" : ""}</div></div>
                    <div className="text-right text-xs">
                      <Badge variant={b.status === "kidded" ? "secondary" : "outline"} className="capitalize">{b.status}</Badge>
                      <div className="mt-1 text-muted-foreground">{b.status === "kidded" ? `${b.kidsBorn ?? "?"} kids · ${fmtShort(b.kiddingDate)}` : b.status === "open" ? (b.usResult === "negative" ? `Ultrasound negative ${fmtShort(b.usDate)}` : "") : b.status === "bred" ? `Ultrasound ${fmtShort(usDue(b))}` : `Due ${fmtShort(b.dueDate)}`}</div>
                      {b.status === "confirmed" && <div className="text-muted-foreground">{b.prekidDate ? `CD&T + BoSe given ${fmtShort(b.prekidDate)}` : `CD&T + BoSe ${fmtShort(prekidDue(b))}`}</div>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="milk" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href="/milk"><MilkIcon />Record milk test</Link></Button>
            <Button variant="outline" onClick={() => setMilkDlg(true)} data-testid="button-milk-status-tab">Change milk status</Button>
          </div>
          <LactationList animalId={a.id} lactations={lactations} />
          {milkByDay.length === 0 ? <Empty icon={MilkIcon} title="No milk tests">Test days are entered on the Milk test page, 3 milk-outs per test.</Empty> : (
            <>
            <div className="h-56 rounded-lg border bg-card p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={milkByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} width={36} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="lbs" name="lb per test day" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm" data-testid="table-milk-tests">
                <thead className="bg-secondary/60 text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left font-semibold">Test day</th><th className="px-2 py-2 text-right font-semibold">Out 1</th><th className="px-2 py-2 text-right font-semibold">Out 2</th><th className="px-2 py-2 text-right font-semibold">Out 3</th><th className="px-3 py-2 text-right font-semibold">Total</th></tr>
                </thead>
                <tbody>
                  {[...myTests].reverse().slice(0, 24).map((m) => (
                    <tr key={m.id} className="border-t tabular-nums">
                      <td className="px-3 py-2">{fmtDate(m.date)}</td>
                      {[m.out1, m.out2, m.out3].map((x, i) => <td key={i} className="px-2 py-2 text-right">{x ?? "—"}</td>)}
                      <td className="px-3 py-2 text-right font-semibold">{m.lbs.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="care"><CareTab animal={a} /></TabsContent>

        <TabsContent value="kids">
          {offspring.length === 0 ? (
            <Empty icon={Users} title="No progeny on file">Kids appear here automatically when their sire or dam is set to {goatName(a)}.</Empty>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {(["doe", "buck", "wether"] as const).map((sx) => { const n = offspring.filter((k) => k.sex === sx).length; return n ? <Badge key={sx} variant="secondary" className="capitalize">{n} {sx}{n > 1 ? "s" : ""}</Badge> : null; })}
                <Badge variant="outline">{inHerd} still in herd</Badge>
              </div>
              {byYear.map(([yr, kids]) => (
                <div key={yr}>
                  <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{yr === "Birth date unknown" ? yr : `Born ${yr}`}</div>
                  <ul className="overflow-hidden rounded-lg border bg-card">
                    {kids.map((k) => {
                      const iAmSire = findByName(k.sire, animals!)?.id === a.id;
                      const otherTxt = iAmSire ? k.dam : k.sire;
                      const otherG = findByName(otherTxt, animals!);
                      const other = otherG ? goatName(otherG) : otherTxt;
                      const otherLabel = iAmSire ? "Dam" : "Sire";
                      const body = (
                        <>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{goatName(k)}{k.tag && <span className="ml-1.5 font-normal text-muted-foreground">#{k.tag}</span>}</div>
                            <div className="truncate text-xs text-muted-foreground"><span className="capitalize">{k.sex}</span>{k.dob ? ` · ${fmtShort(k.dob)} · ${age(k.dob)}` : ""}{other ? <> · {otherLabel}: {shortName(other)}</> : null}</div>
                          </div>
                          <span className="flex shrink-0 items-center gap-1">{k.status !== "active" && <Badge variant="outline" className="capitalize">{k.status}</Badge>}<ChevronRight className="h-4 w-4 text-muted-foreground" /></span>
                        </>
                      );
                      return (
                        <li key={k.id} className="border-b last:border-b-0" data-testid={`row-progeny-${k.id}`}>
                          <Link href={`/animal/${k.id}`} className={`flex items-center justify-between gap-3 px-4 py-2.5 hover-elevate ${k.status === "active" ? "" : "opacity-80"}`} data-testid={`link-progeny-${k.id}`}>{body}</Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Tap any kid to open their profile. Sold and deceased kids stay listed for your records.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="shows"><ShowsTab animal={a} /></TabsContent>
        <TabsContent value="other"><NotesTab animal={a} /></TabsContent>
      </Tabs>

      <PedigreeChart animal={a} animals={animals!} />

      <div className="mt-10 border-t pt-4">
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)} data-testid="button-delete-animal"><Trash2 />Delete animal</Button>
      </div>

      <MilkStatusDialog animal={a} lactations={lactations} open={milkDlg} onOpenChange={setMilkDlg} />
      <AnimalDialog open={editing} onOpenChange={setEditing} animal={a} />
      <TreatDialog open={treating} onOpenChange={setTreating} animal={a} />
      <BreedingDialog open={breedOpen.open} onOpenChange={(o) => setBreedOpen({ open: o })} doeId={id} breeding={breedOpen.b} />
      <HeatDialog open={heatDlg.open} onOpenChange={(o) => setHeatDlg({ open: o, h: o ? heatDlg.h : undefined })} heat={heatDlg.h} doeId={id} />
      <GiveDoseDialog task={giving} onClose={() => setGiving(null)} />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {goatName(a)}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the animal and all of its weights, treatments, breedings, milk records, shows and notes. To keep history, set status to Sold or Deceased instead.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { await removeAnimal.mutateAsync(id); nav("/herd"); }} data-testid="button-confirm-delete">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
