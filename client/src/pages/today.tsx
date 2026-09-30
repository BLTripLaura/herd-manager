import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, CalendarClock, CheckCircle2, Package, Plus, Syringe, Baby, ClipboardList, Flame, SlidersHorizontal, ScanLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, Stat, Empty, useApp } from "@/components/shell";
import { useList, useSave, activeHolds, today, addDays, daysBetween, fmtShort, relDays, shortName, heatWatch, fmtDate, usDue, needsUltrasound, prekidDue, cdtSchedule, calfProKids, CALF_PRO_AGE, CARE_TYPES, type Task, type Breeding, type VaxItem, type Animal , nextDoses, fmtTime, nowTime, goatName, regName, doseText, everyText, taskDoseText } from "@/lib/herd";
import { UltrasoundDialog, PrekidDialog, GiveCdtDialog } from "@/components/pregnancy";
import { CdtDatesDialog } from "@/components/cdt-dates";
import { HeatDialog, TreatDialog } from "@/components/forms";
import { CustomizeTodayDialog, useTodayLayout, type SectionId } from "@/components/today-layout";

function useWide() {
  const mq = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(mq).matches);
  useEffect(() => { const m = window.matchMedia(mq); const f = () => setWide(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return wide;
}
import { GiveDoseDialog, DoseMenu } from "@/components/give-dose";
import { CalfProSection } from "@/components/calf-pro";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Which care job a to-do is about, e.g. "Hoof trim — milking string" → Hoof trim */
const careFor = (title: string) => {
  const t = title.toLowerCase();
  return CARE_TYPES.find((c) => t.startsWith(c.name.toLowerCase()) || t.includes(c.name.toLowerCase().split(/[\s/(]/)[0]));
};

type DueItem = { key: string; date: string; time?: string | null; title: string; sub?: string; href?: string; kind: "dose" | "kid" | "task" | "heat" | "us" | "prekid" | "vax"; taskId?: number; task?: Task; doeId?: number; breeding?: Breeding; vax?: VaxItem; calfPro?: "due" | "done" | "next" };

export default function Today() {
  const [treating, setTreating] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [calfProOpen, setCalfProOpen] = useState(false);
  const { layout } = useTodayLayout();
  const wide = useWide();
  const animals = useList("animals");
  const { data: treatments = [] } = useList("treatments");
  const { data: breedings = [] } = useList("breedings");
  const { data: meds = [] } = useList("medications");
  const { data: tasks = [] } = useList("tasks");
  const { data: milk = [] } = useList("milk");
  const { data: heats = [] } = useList("heats");
  const { data: careRecs = [] } = useList("care");
  const { data: kidWeights = [] } = useList("weights");
  const [heatFor, setHeatFor] = useState<number | null>(null);
  const saveTask = useSave("tasks");
  const { setSelected, setCareJob } = useApp();
  const [, nav] = useLocation();
  const doCare = (k: Task) => {
    const ids = String(k.animalIds || "").split(",").map(Number).filter(Boolean);
    // No goats saved on the task: pick the group or pasture named after the dash ("Hoof trim — milking string")
    const who = (k.title.split(" — ")[1] ?? "").trim().toLowerCase();
    const inGroup = who ? (animals.data ?? []).filter((a) => a.status === "active" && (a.groupName ?? "").toLowerCase() === who).map((a) => a.id) : [];
    setSelected(ids.length ? ids : inGroup);
    setCareJob({ kind: careFor(k.title)?.name ?? k.title.split(" — ")[0], taskId: k.id });
    nav("/batch");
  };
  const [newTask, setNewTask] = useState("");
  const [newTaskDate, setNewTaskDate] = useState(today());
  const [giving, setGiving] = useState<Task | null>(null);
  const [usFor, setUsFor] = useState<Breeding | null>(null);
  const [prekidFor, setPrekidFor] = useState<Breeding | null>(null);
  const [cdtFor, setCdtFor] = useState<{ animal: Animal; label: string } | null>(null);
  const [cdtDates, setCdtDates] = useState(false);

  const t = today();
  const all = animals.data ?? [];
  const byId = useMemo(() => new Map(all.map((a) => [a.id, a])), [all]);
  const active = all.filter((a) => a.status === "active");
  const holds = activeHolds(treatments, animals.data ?? []);
  const lowStock = meds.filter((m) => (m.onHandMl ?? 0) <= (m.reorderAtMl ?? 0));

  const due: DueItem[] = useMemo(() => {
    const horizon = addDays(t, 14);
    const items: DueItem[] = [];
    for (const b of breedings) {
      const a = byId.get(b.doeId);
      if (a && a.status !== "active") continue; // sold or deceased: no kidding, ultrasound or pre-kid reminders
      const nm = a ? goatName(a) : "Doe";
      // Due date roster: only does with a positive ultrasound
      if (b.status === "confirmed" && b.dueDate && b.dueDate <= addDays(t, 30)) {
        items.push({ key: `b${b.id}`, date: b.dueDate, title: `${nm} due to kid`, sub: `Bred to ${shortName(b.buck)}`, href: `/animal/${b.doeId}`, kind: "kid" });
      }
      // Ultrasound requested 30 days after breeding (or at the recheck date)
      if (needsUltrasound(b) && usDue(b) <= horizon) {
        items.push({ key: `u${b.id}`, date: usDue(b), title: `${nm}: ultrasound${b.usResult === "recheck" ? " recheck" : ""}`, sub: `Bred ${fmtShort(b.date)} to ${shortName(b.buck)} · record the result`, href: `/animal/${b.doeId}`, kind: "us", breeding: b });
      }
      // CD&T and BoSe 30 days before the due date
      const pk = prekidDue(b);
      if (pk && !b.prekidDate && pk <= horizon) {
        items.push({ key: `p${b.id}`, date: pk, title: `${nm}: CD&T and BoSe`, sub: `30 days before kidding · due ${fmtShort(b.dueDate)}`, href: `/animal/${b.doeId}`, kind: "prekid", breeding: b });
      }
    }
    // Repeat doses: only the next one in each series shows (hourly eye treatments would otherwise fill the list)
    for (const { task: k, moreToday, remaining, last } of nextDoses(tasks.filter((x) => x.kind === "dose"), t)) {
      if (k.dueDate > horizon) continue;
      const ids = String(k.animalIds || k.animalId || "").split(",").map(Number).filter(Boolean);
      const names = ids.map((id) => byId.get(id)).filter(Boolean).map((a) => goatName(a!));
      const sub = names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
      const more = k.dueTime && remaining ? ` · ${moreToday ? `${moreToday} more today` : `${remaining} more`}, last ${fmtShort(last.dueDate)}${last.dueTime ? ` ${fmtTime(last.dueTime)}` : ""}` : "";
      items.push({ key: `t${k.id}`, date: k.dueDate, time: k.dueTime, title: k.title.split(" — ")[0], sub: k.doseNo ? `Dose ${k.doseNo} of ${k.doseTotal} · ${sub}${more}` : [sub, taskDoseText(k), everyText(k.repeatEvery), k.notes].filter(Boolean).join(" · "), href: ids.length === 1 ? `/animal/${ids[0]}` : undefined, kind: "dose", taskId: k.id, task: k });
    }
    for (const k of tasks) {
      if (k.done || k.dueDate > horizon) continue;
      if (k.kind === "dose") continue;
      else {
        const ids = String(k.animalIds || "").split(",").map(Number).filter(Boolean);
        const names = ids.map((id) => byId.get(id)).filter(Boolean).map((a) => goatName(a!));
        const who = names.length ? (names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} +${names.length - 3} more`) : "";
        const sub = [who, everyText(k.repeatEvery), k.notes].filter(Boolean).join(" · ") || undefined;
        items.push({ key: `t${k.id}`, date: k.dueDate, title: k.title, sub, href: ids.length === 1 ? `/animal/${ids[0]}` : undefined, kind: "task", taskId: k.id, task: k });
      }
    }
    // Kid CD&T series: 4 weeks old, then 4 weeks later (yearly boosters live in their own section)
    for (const v of cdtSchedule(all, treatments, breedings, tasks, t).kid) {
      if (v.due > horizon) continue;
      const nm = goatName(v.animal);
      items.push({ key: `v${v.animal.id}`, date: v.due, kind: "vax", vax: v, href: `/animal/${v.animal.id}`,
        title: `${nm}: kid CD&T dose ${v.kind === "kid1" ? 1 : 2} of 2`,
        sub: v.kind === "kid1" ? `Monday nearest 4 weeks old (${fmtShort(addDays(v.animal.dob!, 28))})` : `Monday nearest 4 weeks after dose 1 (${fmtShort(v.last)})` });
    }
    // Heat watch: does whose predicted heat window is open now or opens within a week
    for (const w of heatWatch(all, heats, breedings, t).items) {
      if (w.state === "check" || w.windowStart > addDays(t, 7) || w.windowEnd < t) continue;
      const open = w.windowStart <= t;
      items.push({
        key: `h${w.doe.id}`, date: open ? t : w.windowStart, kind: "heat", doeId: w.doe.id, href: `/animal/${w.doe.id}`,
        title: w.state === "return" ? `${goatName(w.doe)}: watch for return heat` : `${goatName(w.doe)}: heat watch`,
        sub: `${open ? "Window open" : "Window opens"} · expected ${fmtShort(w.next)} (${fmtShort(w.windowStart)}–${fmtShort(w.windowEnd)})${w.state === "return" ? " · bred, check she settled" : ""}`,
      });
    }
    // Kid program: one line for today's Calf-Pro and one for this week's kid weights
    const cp = calfProKids(all, careRecs, treatments, kidWeights, t);
    const cpDue = cp.filter((k) => k.started && !k.givenToday);
    const names = (l: typeof cp) => { const n = l.map((k) => goatName(k.animal)); return n.length <= 3 ? n.join(", ") : `${n.slice(0, 3).join(", ")} +${n.length - 3} more`; };
    // Calf-Pro stays on the list every day any kid is on the program: due, or checked off once everyone has had it
    const cpOn = cp.filter((k) => k.started);
    if (cpDue.length) items.push({ key: "calfpro", date: t, kind: "vax", calfPro: "due", title: `Calf-Pro for ${cpDue.length} kid${cpDue.length === 1 ? "" : "s"}`, sub: `${names(cpDue)}${cpOn.length > cpDue.length ? ` · ${cpOn.length - cpDue.length} of ${cpOn.length} given` : ""}` });
    else if (cpOn.length) items.push({ key: "calfpro", date: t, kind: "vax", calfPro: "done", title: `Calf-Pro given to all ${cpOn.length} kid${cpOn.length === 1 ? "" : "s"}`, sub: "Done for today" });
    // Coming up: tomorrow's Calf-Pro (it repeats every day until weaned), kids starting it later, and the next weekly weigh-in
    const tmr = addDays(t, 1);
    const cpTmr = cp.filter((k) => k.start <= tmr);
    if (cpTmr.length) items.push({ key: "calfpro-next", date: tmr, kind: "vax", calfPro: "next", title: `Calf-Pro for ${cpTmr.length} kid${cpTmr.length === 1 ? "" : "s"}`, sub: `Every day until weaned · ${names(cpTmr)}` });
    for (const k of cp) if (k.start > tmr && k.start <= horizon) items.push({ key: `calfpro-start-${k.animal.id}`, date: k.start, kind: "vax", calfPro: "next", href: `/animal/${k.animal.id}`, title: `${goatName(k.animal)} starts Calf-Pro`, sub: `${CALF_PRO_AGE} days old · then every day until weaned` });
    const nextWeigh = cp.filter((k) => !k.weighDue).map((k) => k.weighDate).sort()[0];
    if (nextWeigh && nextWeigh <= horizon) { const w = cp.filter((k) => !k.weighDue && k.weighDate === nextWeigh); items.push({ key: "kidweigh-next", date: nextWeigh, kind: "task", href: "/meds", title: `Weekly weights: ${w.length} kid${w.length === 1 ? "" : "s"}`, sub: names(w) }); }
    const wDue = cp.filter((k) => k.weighDue);
    if (wDue.length) items.push({ key: "kidweigh", date: t, kind: "task", href: "/meds", title: `Weekly weights: ${wDue.length} kid${wDue.length === 1 ? "" : "s"}`, sub: names(wDue) });
    return items.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "dose" ? (b.kind === "dose" ? (a.time ?? "").localeCompare(b.time ?? "") : -1) : 1));
  }, [treatments, breedings, tasks, byId, t, heats, all, careRecs, kidWeights]);

  const todo = due.filter((d) => d.date <= t && d.kind !== "kid").sort((a, b) => Number(a.calfPro === "done") - Number(b.calfPro === "done"));
  const upcoming = due.filter((d) => d.date > t || d.kind === "kid");
  const openTodo = todo.filter((d) => d.calfPro !== "done").length;

  const renderItem = (d: DueItem) => {
    const overdue = d.date < t || (d.kind === "dose" && !!d.time && d.date === t && d.time < nowTime());
    const Icon = d.kind === "dose" || d.kind === "prekid" || d.kind === "vax" ? Syringe : d.kind === "kid" ? Baby : d.kind === "heat" ? Flame : d.kind === "us" ? ScanLine : ClipboardList;
    const lead = d.calfPro === "done" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : d.kind === "task" && d.taskId ? (
      <Checkbox aria-label="Mark done" data-testid={`checkbox-task-${d.taskId}`} onCheckedChange={() => saveTask.mutate({ id: d.taskId, done: true })} />
    ) : <Icon className={`h-4 w-4 shrink-0 ${d.kind === "dose" || d.kind === "prekid" || d.kind === "us" || d.kind === "vax" ? "text-primary" : d.kind === "heat" ? "text-rose-600" : "text-muted-foreground"}`} />;
    const text = (
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{d.title}</div>
        {d.sub && <div className="truncate text-xs text-muted-foreground">{d.sub}</div>}
      </div>
    );
    return (
      <li key={d.key} className={`flex items-center gap-3 px-4 py-3 ${d.calfPro === "done" ? "opacity-60" : ""}`} data-testid={`row-due-${d.key}`}>
        {lead}
        {d.href ? <Link href={d.href} className="flex min-w-0 flex-1 hover:underline" data-testid={`link-due-${d.key}`}>{text}</Link> : text}
        <div className={`shrink-0 text-right text-xs ${overdue ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
          <div>{fmtShort(d.date)}{d.time ? <span className="font-semibold"> {fmtTime(d.time)}</span> : null}</div><div>{d.kind === "heat" && d.date === t ? "watch today" : overdue ? (d.date === t && d.time ? "past due" : "overdue") : relDays(d.date)}</div>
        </div>
        {d.kind === "heat" && (
          <Button size="sm" variant="outline" onClick={() => setHeatFor(d.doeId!)} data-testid={`button-inheat-${d.doeId}`}><Flame />In heat</Button>
        )}
        {d.calfPro === "due" && (
          <Button size="sm" onClick={() => setCalfProOpen(true)} data-testid="button-calfpro-give">Give</Button>
        )}
        {d.kind === "vax" && d.vax && (
          <Button size="sm" variant={d.date <= t ? "default" : "outline"} onClick={() => setCdtFor({ animal: d.vax!.animal, label: `Kid CD&T dose ${d.vax!.kind === "kid1" ? 1 : 2} of 2` })} data-testid={`button-cdt-${d.vax.animal.id}`}>Give</Button>
        )}
        {d.kind === "us" && d.breeding && (
          <Button size="sm" variant={d.date <= t ? "default" : "outline"} onClick={() => setUsFor(d.breeding!)} data-testid={`button-us-${d.breeding.id}`}>Result</Button>
        )}
        {d.kind === "prekid" && d.breeding && (
          <Button size="sm" variant={d.date <= t ? "default" : "outline"} onClick={() => setPrekidFor(d.breeding!)} data-testid={`button-prekid-${d.breeding.id}`}>Give</Button>
        )}
        {d.kind === "task" && d.task && careFor(d.task.title) && (
          <Button size="sm" variant={d.date <= t ? "default" : "outline"} onClick={() => doCare(d.task!)} data-testid={`button-docare-${d.taskId}`}>Check off goats</Button>
        )}
        {d.kind === "dose" && d.task && (
          <Button size="sm" variant={d.date <= t ? "default" : "outline"} onClick={() => setGiving(d.task!)} data-testid={`button-give-${d.taskId}`}>{d.date <= t ? "Give" : "Log"}</Button>
        )}
        {d.kind === "dose" && d.task && <DoseMenu task={d.task} tasks={tasks} />}
      </li>
    );
  };

  const lastTestDate = milk.reduce((mx, m) => (m.date > mx ? m.date : mx), "");
  const lastTestTotal = milk.filter((m) => m.date === lastTestDate).reduce((s, m) => s + m.lbs, 0);
  const nextDue = breedings.filter((b) => b.status === "confirmed" && b.dueDate && daysBetween(t, b.dueDate) >= -7).map((b) => b.dueDate!).sort()[0];
  const dueSoonKids = new Set(breedings.filter((b) => b.status === "confirmed" && b.dueDate && daysBetween(t, b.dueDate) <= 30 && daysBetween(t, b.dueDate) >= -7).map((b) => b.doeId)).size;

  const vax = cdtSchedule(all, treatments, breedings, tasks, t);
  const annualSoon = vax.annual.filter((v) => v.due <= addDays(t, 30));
  const nextAnnual = vax.annual.find((v) => v.due > addDays(t, 30));
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  if (animals.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-64" /></div>;

  return (
    <>
      <TreatDialog open={treating} onOpenChange={setTreating} />
      <UltrasoundDialog breeding={usFor} onOpenChange={(o) => !o && setUsFor(null)} />
      <PrekidDialog breeding={prekidFor} onOpenChange={(o) => !o && setPrekidFor(null)} />
      <GiveCdtDialog item={cdtFor} onOpenChange={(o) => !o && setCdtFor(null)} />
      <CdtDatesDialog open={cdtDates} onOpenChange={setCdtDates} />
      <PageHeader title="Today" sub={dateLabel}>
        <Button asChild variant="outline" size="sm"><Link href="/batch" data-testid="link-quick-batch"><ClipboardList />Batch entry</Link></Button>
        <Button variant="outline" size="sm" onClick={() => setTreating(true)} data-testid="button-quick-treat"><Syringe />Log treatment</Button>
        <Button asChild size="sm"><Link href="/milk" data-testid="link-quick-milk"><Plus />Milk test</Link></Button>
        <Button variant="ghost" size="sm" onClick={() => setCustomizing(true)} data-testid="button-customize-today"><SlidersHorizontal />Customize</Button>
      </PageHeader>
      <CustomizeTodayDialog open={customizing} onOpenChange={setCustomizing} />

      {(() => {
        const blocks: Record<SectionId, React.ReactNode> = {
          stats: (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active animals" value={active.length} hint={`${active.filter((a) => a.sex === "doe").length} does · ${active.filter((a) => a.sex === "buck").length} bucks`} href="/herd/active" />
        <Stat label="In milk" value={active.filter((a) => a.inMilk).length} hint={[active.filter((a) => a.milkStatus === "mastitis").length ? `${active.filter((a) => a.milkStatus === "mastitis").length} mastitis` : "", active.filter((a) => a.milkStatus === "drying").length ? `${active.filter((a) => a.milkStatus === "drying").length} drying up` : "", lastTestDate ? `Last test ${fmtShort(lastTestDate)} · ${lastTestTotal.toFixed(1)} lb` : "No milk tests yet"].filter(Boolean).join(" · ")} href="/herd/milking" />
        <Stat label="Milk holds" value={holds.milk.size} hint={holds.milk.size ? "Do not ship milk" : "All clear"} tone={holds.milk.size ? "warn" : undefined} href="/herd/milk-holds" />
        <Stat label="Kidding in 30 days" value={dueSoonKids} hint={nextDue ? `Next due ${fmtShort(nextDue)}` : "None confirmed"} href="/herd/kidding" />
      </div>
          ),
          holds: holds.milk.size + holds.meat.size > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200"><AlertTriangle className="h-4 w-4" />Withdrawal holds</h2>
              <ul className="space-y-2">
                {Array.from(new Set([...Array.from(holds.milk.keys()), ...Array.from(holds.meat.keys())])).map((id) => {
                  const a = byId.get(id); const m = holds.milk.get(id); const mt = holds.meat.get(id);
                  return (
                    <li key={id}>
                      <Link href={`/animal/${id}`} className="flex items-center justify-between gap-3 rounded-md bg-background/70 px-3 py-2 hover-elevate" data-testid={`link-hold-${id}`}>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{a ? goatName(a) : `#${id}`}{a?.tag ? <span className="ml-1.5 font-normal text-muted-foreground">#{a.tag}</span> : null}</div>
                          <div className="truncate text-xs text-muted-foreground">{(m ?? mt)?.medName}</div>
                        </div>
                        <div className="shrink-0 text-right text-xs">
                          {m && <div className="font-semibold text-amber-900 dark:text-amber-200">Milk clear {fmtShort(m.milkClearDate)}</div>}
                          {mt && <div className="text-muted-foreground">Meat clear {fmtShort(mt.meatClearDate)}</div>}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ),
          todo: (
            <div className="rounded-lg border bg-card" data-testid="card-todo">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold"><ClipboardList className="h-4 w-4 text-primary" />To do today</h2>
              <span className="text-xs text-muted-foreground">{openTodo ? `${openTodo} item${openTodo > 1 ? "s" : ""}` : "All caught up"}</span>
            </div>
            {todo.length === 0 ? (
              <div className="p-4"><Empty icon={CheckCircle2} title="Nothing due today">Repeat doses and farm tasks due today or overdue show here.</Empty></div>
            ) : <ul className="divide-y">{todo.map(renderItem)}</ul>}
            <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); if (!newTask.trim()) return; saveTask.mutate({ title: newTask.trim(), dueDate: newTaskDate, done: false, kind: "task" }); setNewTask(""); }}>
              <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a farm task…" data-testid="input-new-task" />
              <Input type="date" value={newTaskDate} onChange={(e) => setNewTaskDate(e.target.value)} className="w-40 shrink-0" data-testid="input-task-date" />
              <Button type="submit" size="icon" aria-label="Add task" data-testid="button-add-task"><Plus /></Button>
            </form>
          </div>
          ),
          upcoming: (
            <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold"><CalendarClock className="h-4 w-4 text-primary" />Coming up</h2>
              <span className="text-xs text-muted-foreground">Next 14 days · kidding 30 days</span>
            </div>
            {upcoming.length === 0 ? (
              <div className="p-4"><Empty icon={CheckCircle2} title="Nothing scheduled">Upcoming repeat doses, kiddings and tasks will show here.</Empty></div>
            ) : <ul className="divide-y">{upcoming.map(renderItem)}</ul>}
          </div>
          ),
          vaccines: (
            <div className="rounded-lg border bg-card" data-testid="card-vaccines">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-primary" />Annual vaccines</h2>
                <span className="text-xs text-muted-foreground">CD&T · next 30 days</span>
              </div>
              {annualSoon.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">{nextAnnual ? `No boosters due. Next: ${goatName(nextAnnual.animal)} ${fmtShort(nextAnnual.due)}.` : "No yearly boosters due."}</div>
              ) : (
                <ul className="divide-y">
                  {annualSoon.map((v) => {
                    const overdue = v.due < t;
                    return (
                      <li key={v.animal.id} className="flex items-center gap-3 px-4 py-2.5" data-testid={`row-annual-${v.animal.id}`}>
                        <Link href={`/animal/${v.animal.id}`} className="min-w-0 flex-1 hover:underline">
                          <div className="truncate text-sm font-medium">{goatName(v.animal)}</div>
                          <div className="truncate text-xs text-muted-foreground">CD&T booster · last {fmtDate(v.last)}</div>
                        </Link>
                        <div className={`shrink-0 text-right text-xs ${overdue ? "font-semibold text-destructive" : "text-muted-foreground"}`}><div>{fmtShort(v.due)}</div><div>{overdue ? "overdue" : relDays(v.due)}</div></div>
                        <Button size="sm" variant="outline" onClick={() => setCdtFor({ animal: v.animal, label: "Yearly CD&T booster" })} data-testid={`button-annual-${v.animal.id}`}>Give</Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {vax.noRecord.length > 0 && (
                <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5 text-xs">
                  <span className="text-muted-foreground">{vax.noRecord.length} goat{vax.noRecord.length === 1 ? " has" : "s have"} no CD&T date yet, so no reminders.</span>
                  <Button size="sm" variant="outline" onClick={() => setCdtDates(true)} data-testid="button-no-cdt">Enter dates</Button>
                </div>
              )}
              <div className="border-t px-4 py-2 text-xs text-muted-foreground">Confirmed pregnant does get theirs 30 days before kidding instead.</div>
            </div>
          ),
          cabinet: (
            <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold"><Package className="h-4 w-4 text-primary" />Medicine cabinet</h2>
              <Link href="/meds" className="text-xs font-medium text-primary" data-testid="link-all-meds">View all</Link>
            </div>
            <ul className="divide-y">
              {meds.map((m) => {
                const low = (m.onHandMl ?? 0) <= (m.reorderAtMl ?? 0);
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="truncate text-sm">{m.name}</span>
                    <span className={`shrink-0 text-xs tabular-nums ${low ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{Math.round((m.onHandMl ?? 0) * 10) / 10} mL{low ? " · reorder" : ""}</span>
                  </li>
                );
              })}
            </ul>
            {lowStock.length > 0 && <div className="border-t px-4 py-2 text-xs text-destructive">{lowStock.length} item{lowStock.length > 1 ? "s" : ""} at or below reorder level</div>}
          </div>
          ),
          recent: (
            <div className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3"><h2 className="text-sm font-bold">Recent treatments</h2></div>
            <ul className="divide-y">
              {[...treatments].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 6).map((tr) => {
                const a = byId.get(tr.animalId);
                return (
                  <li key={tr.id}>
                    <Link href={`/animal/${tr.animalId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover-elevate">
                      <div className="min-w-0"><div className="truncate text-sm">{a ? goatName(a) : "—"}</div><div className="truncate text-xs text-muted-foreground">{tr.medName}{doseText(tr) ? ` · ${doseText(tr)}` : ""}</div></div>
                      <span className="shrink-0 text-xs text-muted-foreground">{fmtShort(tr.date)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          ),
        };
        const shown = layout.filter((x) => !x.hidden && blocks[x.id]);
        if (!wide) return <div className="space-y-6" data-testid="today-sections">{shown.map((x) => <div key={x.id} data-section={x.id}>{blocks[x.id]}</div>)}</div>;
        const col = (side: "left" | "right") => shown.filter((x) => x.id !== "stats" && x.side === side);
        const stat = shown.find((x) => x.id === "stats");
        const statFirst = stat && shown[shown.length - 1]?.id !== "stats";
        return (
          <div className="space-y-6" data-testid="today-sections">
            {stat && statFirst && <div data-section="stats">{blocks.stats}</div>}
            <div className="grid grid-cols-5 gap-6">
              <section className="col-span-3 min-w-0 space-y-6">{col("left").map((x) => <div key={x.id} data-section={x.id}>{blocks[x.id]}</div>)}</section>
              <section className="col-span-2 min-w-0 space-y-6">{col("right").map((x) => <div key={x.id} data-section={x.id}>{blocks[x.id]}</div>)}</section>
            </div>
            {stat && !statFirst && <div data-section="stats">{blocks.stats}</div>}
          </div>
        );
      })()}
      <HeatDialog open={heatFor !== null} onOpenChange={(o) => !o && setHeatFor(null)} doeId={heatFor ?? undefined} />
      <GiveDoseDialog task={giving} onClose={() => setGiving(null)} />
      <Dialog open={calfProOpen} onOpenChange={setCalfProOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Calf-Pro today</DialogTitle></DialogHeader>
          <CalfProSection onGiven={() => setCalfProOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
