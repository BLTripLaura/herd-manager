import { UltrasoundDialog, PrekidDialog } from "@/components/pregnancy";
import { useState } from "react";
import { Link } from "wouter";
import { Heart, Plus, Baby, Snowflake, Pencil, Users, Flame, CalendarClock, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Empty, Stat } from "@/components/shell";
import { BreedingDialog, OutsideBuckDialog, PedigreeLink, HeatDialog } from "@/components/forms";
import { useList, fmtShort, fmtDate, relDays, daysBetween, today, shortName, heatWatch, HEAT_TYPICAL, type Breeding, type OutsideBuck, type Heat, type HeatWatchItem, addDays, usDue, needsUltrasound, prekidDue, ULTRASOUND_DAYS, PREKID_DAYS, goatName, regName } from "@/lib/herd";

export default function BreedingPage() {
  const { data: breedings = [] } = useList("breedings");
  const { data: animals = [] } = useList("animals");
  const { data: outside = [] } = useList("outsideBucks");
  const [dlg, setDlg] = useState<{ open: boolean; b?: Breeding; doeId?: number }>({ open: false });
  const [gdlg, setGdlg] = useState<{ open: boolean; b?: OutsideBuck }>({ open: false });
  const { data: heats = [] } = useList("heats");
  const [hdlg, setHdlg] = useState<{ open: boolean; h?: Heat; doeId?: number }>({ open: false });
  const [showAllHeats, setShowAllHeats] = useState(false);
  const obById = new Map(outside.map((o) => [o.id, o]));
  const guests = outside.filter((o) => o.kind === "guest");
  const tankOnHand = outside.filter((o) => o.kind === "frozen").reduce((n, o) => n + (o.strawsOnHand ?? 0), 0);
  const pedigreeFor = (b: Breeding) => b.buckSource === "herd" ? byId.get(b.buckRefId ?? -1)?.pedigreeUrl : b.buckRefId ? obById.get(b.buckRefId)?.pedigreeUrl : null;
  const srcLabel = (b: Breeding) => b.buckSource === "frozen" ? `AI · ${b.straws ?? 1} straw${(b.straws ?? 1) === 1 ? "" : "s"}` : b.buckSource === "guest" ? `${b.method} · guest buck${obById.get(b.buckRefId ?? -1)?.farm ? `, ${obById.get(b.buckRefId ?? -1)?.farm}` : ""}` : b.method;
  const byId = new Map(animals.map((a) => [a.id, a]));
  const t = today();
  const pending = breedings.filter((b) => b.status === "bred" || b.status === "confirmed").sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const awaiting = breedings.filter((b) => b.status === "bred").sort((a, b) => usDue(a).localeCompare(usDue(b)));
  const roster = breedings.filter((b) => b.status === "confirmed").sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const [usFor, setUsFor] = useState<Breeding | null>(null);
  const [prekidFor, setPrekidFor] = useState<Breeding | null>(null);
  const done = breedings.filter((b) => b.status === "kidded" || b.status === "open").sort((a, b) => (b.kiddingDate ?? b.date).localeCompare(a.kiddingDate ?? a.date));
  const kidsThisYear = breedings.filter((b) => b.status === "kidded" && b.kiddingDate?.startsWith(t.slice(0, 4))).reduce((s, b) => s + (b.kidsBorn ?? 0), 0);

  const watch = heatWatch(animals, heats, breedings, t);
  const inWindow = watch.items.filter((w) => w.state === "now" || (w.state === "return" && Math.abs(w.daysUntil) <= 2)).length;
  const recentHeats = [...heats].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const stateBadge = (w: HeatWatchItem) => {
    if (w.state === "now") return <Badge className="bg-rose-600 text-white hover:bg-rose-600">Watch now</Badge>;
    if (w.state === "return") return <Badge className={Math.abs(w.daysUntil) <= 2 ? "bg-amber-500 text-white hover:bg-amber-500" : "bg-primary text-primary-foreground hover:bg-primary"}>{Math.abs(w.daysUntil) <= 2 ? "Bred · watch now" : "Bred · watch closely"}</Badge>;
    if (w.state === "check") return <Badge variant="secondary">No return seen</Badge>;
    if (w.state === "soon") return <Badge variant="outline" className="border-primary text-primary">Soon</Badge>;
    return <Badge variant="outline">Upcoming</Badge>;
  };
  const WatchRow = ({ w }: { w: HeatWatchItem }) => (
    <li className={`border-b px-4 py-3 last:border-b-0 ${w.breeding ? "border-l-4 border-l-primary bg-primary/[0.06]" : ""}`} data-testid={`row-heatwatch-${w.doe.id}`} data-bred={w.breeding ? "true" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/animal/${w.doe.id}`} className="truncate text-sm font-semibold hover:underline">{goatName(w.doe)}</Link>
            {stateBadge(w)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Last {w.lastFrom === "breeding" ? "bred" : "heat"} {fmtShort(w.last)} · {w.personal ? `her cycle ${w.interval} days` : `typical ${w.interval}-day cycle`}
            {w.missed > 0 && !w.breeding && <> · {w.missed} heat{w.missed === 1 ? "" : "s"} not logged since</>}
          </div>
          <div className="mt-0.5 text-xs">
            {w.state === "return" && w.breeding
                ? <><span className="font-semibold">Bred {fmtShort(w.breeding.date)} to {shortName(w.breeding.buck)}</span> ({daysBetween(w.breeding.date, today())} days ago). {w.missed > 0 ? <>No return heat in {w.missed} window{w.missed === 1 ? "" : "s"} so far. </> : null}Watch {fmtShort(w.windowStart)}–{fmtShort(w.windowEnd)}; if she comes back in heat, she didn't settle. Stays on watch until an ultrasound confirms her {usDue(w.breeding) < today() ? <span className="font-semibold text-destructive">(ultrasound overdue since {fmtShort(usDue(w.breeding))})</span> : `(ultrasound ${fmtShort(usDue(w.breeding))})`}.</>
                : <>Next heat about <span className="font-semibold">{fmtShort(w.next)}</span> · watch {fmtShort(w.windowStart)}–{fmtShort(w.windowEnd)}</>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-sm font-semibold tabular-nums ${w.state === "now" ? "text-rose-600" : ""}`}>
            {w.state === "check" ? "" : w.daysUntil === 0 ? "Today" : w.daysUntil > 0 ? `in ${w.daysUntil} d` : `${-w.daysUntil} d ago`}
          </div>
          <div className="mt-1 flex justify-end gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setHdlg({ open: true, doeId: w.doe.id })} data-testid={`button-heat-${w.doe.id}`}><Flame className="h-3.5 w-3.5" />In heat</Button>
            {w.breeding
              ? <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setDlg({ open: true, doeId: w.doe.id })} data-testid={`button-breed-${w.doe.id}`}><Heart className="h-3.5 w-3.5" />Rebreed</Button>
              : <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setDlg({ open: true, doeId: w.doe.id })} data-testid={`button-breed-${w.doe.id}`}><Heart className="h-3.5 w-3.5" />Breed</Button>}
          </div>
        </div>
      </div>
    </li>
  );

  const Row = ({ b }: { b: Breeding }) => {
    const doe = byId.get(b.doeId);
    const days = b.dueDate ? daysBetween(t, b.dueDate) : null;
    const pct = b.dueDate ? Math.min(100, Math.max(0, (daysBetween(b.date, t) / Math.max(1, daysBetween(b.date, b.dueDate))) * 100)) : 0;
    return (
      <li>
        <div role="button" tabIndex={0} onClick={() => setDlg({ open: true, b })} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setDlg({ open: true, b })} className="w-full cursor-pointer border-b px-4 py-3 text-left hover-elevate" data-testid={`row-breeding-${b.id}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{doe ? goatName(doe) : "Unknown doe"} <span className="font-normal text-muted-foreground">× {shortName(b.buck)}</span></div>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">Bred {fmtDate(b.date)} · {srcLabel(b)} <PedigreeLink url={pedigreeFor(b)} /></div>
            </div>
            <div className="shrink-0 text-right">
              {b.status === "kidded" ? <><Badge variant="secondary">Kidded</Badge><div className="mt-1 text-xs text-muted-foreground">{b.kidsBorn ?? "?"} kids · {fmtShort(b.kiddingDate)}</div></>
                : b.status === "open" ? <Badge variant="outline">Open</Badge>
                : b.status === "bred" ? (() => { const u = usDue(b); const late = u < t; return <>
                  <div className={`text-sm font-semibold ${late ? "text-destructive" : u === t ? "text-primary" : ""}`}>Ultrasound {fmtShort(u)}</div>
                  <div className="text-xs text-muted-foreground">{late ? "overdue" : relDays(u)}{b.usResult === "recheck" ? " · recheck" : ""} · est. due {fmtShort(b.dueDate)}</div></>; })()
                : <><div className={`text-sm font-semibold ${days !== null && days <= 7 ? "text-primary" : ""}`}>Due {fmtShort(b.dueDate)}</div><div className="text-xs text-muted-foreground">{b.dueDate && relDays(b.dueDate)} · confirmed</div></>}
            </div>
          </div>
          {b.status === "confirmed" && (() => { const pk = prekidDue(b)!; return (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              {b.prekidDate ? <Badge variant="secondary">CD&T + BoSe given {fmtShort(b.prekidDate)}</Badge>
                : <><Badge variant="outline" className={pk <= t ? "border-amber-400 text-amber-800 dark:text-amber-300" : ""}>CD&T + BoSe {pk < t ? "overdue" : pk === t ? "today" : fmtShort(pk)}</Badge>
                  <Button size="sm" variant={pk <= t ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setPrekidFor(b); }} data-testid={`button-prekid-${b.id}`}>Give</Button></>}
              {b.usDate && <span className="text-muted-foreground">Ultrasound positive {fmtShort(b.usDate)}{b.usNotes ? ` · ${b.usNotes}` : ""}</span>}
            </div>); })()}
          {b.status === "bred" && usDue(b) <= addDays(t, 7) && (
            <div className="mt-1.5"><Button size="sm" variant={usDue(b) <= t ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setUsFor(b); }} data-testid={`button-us-${b.id}`}>Record ultrasound</Button></div>
          )}
          {(b.status === "bred" || b.status === "confirmed") && <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>}
        </div>
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Breeding & kidding" sub="Due dates use a 150-day gestation, 145 days for Nigerian Dwarf does.">
        <Button variant="outline" asChild><Link href="/breeding/plan" data-testid="link-breeding-plan"><ClipboardList />Breeding plan</Link></Button>
        <Button variant="outline" asChild><Link href="/tank" data-testid="link-tank"><Snowflake />Tank · {tankOnHand} straws</Link></Button>
        <Button variant="outline" onClick={() => setHdlg({ open: true })} data-testid="button-log-heat"><Flame />Log heat</Button>
        <Button onClick={() => setDlg({ open: true })} data-testid="button-new-breeding"><Plus />Record breeding</Button>
      </PageHeader>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="In heat window" value={inWindow} />
        <Stat label="Awaiting ultrasound" value={awaiting.length} />
        <Stat label="Due in 30 days" value={roster.filter((b) => b.dueDate && daysBetween(t, b.dueDate) <= 30).length} />
        <Stat label={`Kids born ${t.slice(0, 4)}`} value={kidsThisYear} />
      </div>
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">Heat watch</h2>
          <p className="text-xs text-muted-foreground">Next heat is predicted from each doe's own cycle (typical {HEAT_TYPICAL} days). Watch 2 days either side. Bred does are highlighted and stay on watch until confirmed.</p>
        </div>
      </div>
      {watch.items.length ? (
        <ul className="mb-3 overflow-hidden rounded-lg border bg-card" data-testid="list-heat-watch">{watch.items.map((w) => <WatchRow key={w.doe.id} w={w} />)}</ul>
      ) : (
        <div className="mb-3"><Empty icon={CalendarClock} title="No does on heat watch">Log a heat to start predicting her next one.</Empty></div>
      )}
      {watch.noHistory.length > 0 && (
        <details className="mb-3 rounded-lg border border-dashed" data-testid="details-no-heat-history">
          <summary className="cursor-pointer px-4 py-2.5 text-xs text-muted-foreground"><span className="font-semibold">No heats logged yet · {watch.noHistory.length} doe{watch.noHistory.length === 1 ? "" : "s"}.</span> You can breed them without logging a heat; the breeding day counts as her heat day and she goes on heat watch.</summary>
          <ul className="border-t">
            {watch.noHistory.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 border-b px-4 py-2 last:border-b-0" data-testid={`row-noheat-${d.id}`}>
                <Link href={`/animal/${d.id}`} className="min-w-0 truncate text-sm font-semibold hover:underline">{goatName(d)}</Link>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setHdlg({ open: true, doeId: d.id })} data-testid={`button-heat-nh-${d.id}`}><Flame className="h-3.5 w-3.5" />In heat</Button>
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setDlg({ open: true, doeId: d.id })} data-testid={`button-breed-nh-${d.id}`}><Heart className="h-3.5 w-3.5" />Breed</Button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {recentHeats.length > 0 && (
        <details className="mb-8 rounded-lg border bg-card" data-testid="details-heat-log">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-muted-foreground">Heat log · {recentHeats.length} recorded</summary>
          <ul className="border-t">
            {(showAllHeats ? recentHeats : recentHeats.slice(0, 8)).map((h) => {
              const doe = byId.get(h.doeId);
              return (
                <li key={h.id}>
                  <button onClick={() => setHdlg({ open: true, h })} className="flex w-full items-center justify-between gap-3 border-b px-4 py-2 text-left text-sm hover-elevate" data-testid={`row-heat-${h.id}`}>
                    <span className="min-w-0 truncate"><span className="font-semibold">{doe ? goatName(doe) : "Unknown"}</span> <span className="text-xs text-muted-foreground">{h.signs ? `· ${h.signs.split(",").join(", ")}` : ""}</span></span>
                    <span className="shrink-0 text-xs text-muted-foreground"><span className="capitalize">{h.strength}</span> · {fmtShort(h.date)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {recentHeats.length > 8 && <button className="w-full px-4 py-2 text-xs text-primary hover:underline" onClick={() => setShowAllHeats(!showAllHeats)}>{showAllHeats ? "Show fewer" : `Show all ${recentHeats.length}`}</button>}
        </details>
      )}
      {recentHeats.length === 0 && <div className="mb-8" />}
      <h2 className="text-sm font-bold">Due date roster</h2>
      <p className="mb-2 text-xs text-muted-foreground">Does with a positive ultrasound. CD&T and BoSe are due {PREKID_DAYS} days before each due date.</p>
      {roster.length ? <ul className="mb-8 overflow-hidden rounded-lg border bg-card" data-testid="list-due-roster">{roster.map((b) => <Row key={b.id} b={b} />)}</ul>
        : <div className="mb-8"><Empty icon={Baby} title="No confirmed pregnancies">Record a positive ultrasound to add a doe here.</Empty></div>}
      <h2 className="text-sm font-bold">Awaiting ultrasound</h2>
      <p className="mb-2 text-xs text-muted-foreground">Ultrasound is requested {ULTRASOUND_DAYS} days after breeding and shows on the Today list.</p>
      {awaiting.length ? <ul className="mb-8 overflow-hidden rounded-lg border bg-card" data-testid="list-awaiting-us">{awaiting.map((b) => <Row key={b.id} b={b} />)}</ul>
        : <div className="mb-8"><Empty icon={Heart} title="No does waiting on an ultrasound" /></div>}
      <h2 className="mb-2 text-sm font-bold">History</h2>
      {done.length ? <ul className="overflow-hidden rounded-lg border bg-card">{done.map((b) => <Row key={b.id} b={b} />)}</ul>
        : <Empty icon={Baby} title="No kiddings recorded yet">Tap an expecting doe and set status to Kidded to record kids.</Empty>}
      <div className="mb-2 mt-8 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">Guest bucks</h2>
        <Button size="sm" variant="outline" onClick={() => setGdlg({ open: true })} data-testid="button-add-guest"><Plus />Add guest buck</Button>
      </div>
      {guests.length ? (
        <ul className="overflow-hidden rounded-lg border bg-card">
          {guests.map((g) => {
            const n = breedings.filter((b) => b.buckSource === "guest" && b.buckRefId === g.id).length;
            return (
              <li key={g.id} className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0" data-testid={`row-guest-${g.id}`}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{goatName(g)} {!g.active && <Badge variant="outline" className="ml-1">Not available</Badge>}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {g.farm && <span>{g.farm}</span>}{g.regNumber && <span>Reg {g.regNumber}</span>}<span>{n} breeding{n === 1 ? "" : "s"}</span>
                    {g.pedigreeUrl ? <PedigreeLink url={g.pedigreeUrl} /> : <span>No pedigree link</span>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setGdlg({ open: true, b: g })} data-testid={`button-edit-guest-${g.id}`}><Pencil />Edit</Button>
              </li>
            );
          })}
        </ul>
      ) : <Empty icon={Users} title="No guest bucks">Add a buck from another farm to use him for live cover.</Empty>}
      <p className="mt-4 text-xs text-muted-foreground">Tip: open a doe from the <Link href="/herd" className="text-primary">Herd</Link> to see her full breeding history.</p>
      <OutsideBuckDialog open={gdlg.open} kind="guest" buck={gdlg.b} onOpenChange={(o) => setGdlg({ open: o, b: o ? gdlg.b : undefined })} />
      <BreedingDialog open={dlg.open} onOpenChange={(o) => setDlg({ open: o, b: o ? dlg.b : undefined, doeId: o ? dlg.doeId : undefined })} breeding={dlg.b} doeId={dlg.doeId} />
      <UltrasoundDialog breeding={usFor} onOpenChange={(o) => !o && setUsFor(null)} />
      <PrekidDialog breeding={prekidFor} onOpenChange={(o) => !o && setPrekidFor(null)} />
      <HeatDialog open={hdlg.open} onOpenChange={(o) => setHdlg({ open: o, h: o ? hdlg.h : undefined, doeId: o ? hdlg.doeId : undefined })} heat={hdlg.h} doeId={hdlg.doeId} />
    </>
  );
}
