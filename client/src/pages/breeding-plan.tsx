import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, ClipboardList, Heart, Printer, Search, AlertTriangle, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Empty, Stat } from "@/components/shell";
import { BreedingDialog } from "@/components/forms";
import { buildPedigree } from "@/components/pedigree";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useList, fmtDate, fmtShort, age, shortName, today, type Animal, type BreedingPlan, type OutsideBuck, goatName, regName } from "@/lib/herd";
import { findParent } from "@shared/breed";

/* Breeding plan: every doe with her birth date, dam and sire, and a buck picked for the season.
   Bucks come from the herd, the semen tank, guest bucks on file, or "Other" typed in. */

const low = (x?: string | null) => String(x ?? "").trim().toLowerCase();
type Pick = { key: string; source: string; refId: number | null; name: string };

/** How a planned buck is related to the doe, if at all (checks the herd records and her stored pedigree) */
function relation(doe: Animal, buckName: string, buck: Animal | null, animals: Animal[]): string | null {
  if (!buckName) return null;
  const ped = buildPedigree(doe, animals);
  const same = (n: { name: string | null; animal: Animal | null } | undefined) => !!n && ((buck && n.animal?.id === buck.id) || (!!n.name && low(n.name) === low(buckName)));
  const where: Record<string, string> = { S: "her sire", SS: "her sire's sire", DS: "her dam's sire", SSS: "a great-grandsire", SDS: "a great-grandsire", DSS: "a great-grandsire", DDS: "a great-grandsire" };
  for (const p of ["S", "SS", "DS", "SSS", "SDS", "DSS", "DDS"]) if (same(ped[p])) return `He is ${where[p]}`;
  if (buck) {
    const bs = findParent(buck.sire, animals), bd = findParent(buck.dam, animals);
    const ds = findParent(doe.sire, animals), dd = findParent(doe.dam, animals);
    if (bd?.id === doe.id) return "He is her son";
    if (findParent(bd?.dam, animals)?.id === doe.id || findParent(bs?.dam, animals)?.id === doe.id) return "He is her grandson";
    const sameSire = (bs && ds && bs.id === ds.id) || (!!buck.sire && low(buck.sire) === low(doe.sire));
    const sameDam = (bd && dd && bd.id === dd.id) || (!!buck.dam && low(buck.dam) === low(doe.dam));
    if (sameSire && sameDam) return "Full brother";
    if (sameSire) return "Half brother (same sire)";
    if (sameDam) return "Half brother (same dam)";
  }
  return null;
}

export default function BreedingPlanPage() {
  const { toast } = useToast();
  const { data: animals = [] } = useList("animals");
  const { data: outside = [] } = useList("outsideBucks");
  const { data: plans = [] } = useList("breedingPlans");
  const { data: breedings = [] } = useList("breedings");
  const thisYear = today().slice(0, 4);
  const seasons = useMemo(() => Array.from(new Set([...plans.map((p) => p.season), thisYear, String(Number(thisYear) + 1)])).sort(), [plans, thisYear]);
  const [season, setSeason] = useState(thisYear);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "open" | "planned">("all");
  const [otherFor, setOtherFor] = useState<Record<number, string>>({});
  const [breed, setBreed] = useState<{ doeId: number; preset?: { buckSource: string; buckRefId: number; buck: string } } | null>(null);

  const byId = new Map(animals.map((a) => [a.id, a]));
  const does = animals.filter((a) => a.sex === "doe" && a.status === "active").sort((a, b) => (a.barnName || a.name).localeCompare(b.barnName || b.name));
  const herdBucks = animals.filter((a) => a.sex === "buck" && a.status === "active").sort((a, b) => a.name.localeCompare(b.name));
  const tank = outside.filter((o) => o.kind === "frozen" && (o.active || plans.some((p) => p.buckSource === "frozen" && p.buckRefId === o.id))).sort((a, b) => a.name.localeCompare(b.name));
  const guests = outside.filter((o) => o.kind === "guest" && (o.active || plans.some((p) => p.buckSource === "guest" && p.buckRefId === o.id))).sort((a, b) => a.name.localeCompare(b.name));
  const planFor = new Map(plans.filter((p) => p.season === season).map((p) => [p.doeId, p]));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/breedingPlans"] });
  const save = async (doe: Animal, pick: Pick | null, notes?: string) => {
    const cur = planFor.get(doe.id);
    try {
      if (!pick && notes === undefined) { if (cur) await apiRequest("DELETE", `/api/breedingPlans/${cur.id}`); }
      else {
        const body: any = pick ? { buckSource: pick.source, buckRefId: pick.refId, buck: pick.name || null } : {};
        if (notes !== undefined) body.notes = notes || null;
        if (cur) await apiRequest("PATCH", `/api/breedingPlans/${cur.id}`, body);
        else await apiRequest("POST", "/api/breedingPlans", { season, doeId: doe.id, ...body });
      }
      refresh();
    } catch (e: any) { toast({ title: "Couldn't save the plan", description: String(e?.message ?? e), variant: "destructive" }); }
  };
  const choose = (doe: Animal, key: string) => {
    if (!key) return save(doe, null);
    if (key === "other") { setOtherFor({ ...otherFor, [doe.id]: planFor.get(doe.id)?.buckSource === "other" ? planFor.get(doe.id)?.buck ?? "" : "" }); return save(doe, { key, source: "other", refId: null, name: planFor.get(doe.id)?.buckSource === "other" ? planFor.get(doe.id)?.buck ?? "" : "" }); }
    const [src, id] = key.split(":");
    const name = src === "herd" ? byId.get(Number(id))?.name : outside.find((o) => o.id === Number(id))?.name;
    save(doe, { key, source: src, refId: Number(id), name: name ?? "" });
  };
  const keyOf = (p?: BreedingPlan) => (!p || !p.buckSource ? "" : p.buckSource === "other" ? "other" : `${p.buckSource}:${p.buckRefId}`);
  const buckLabel = (p: BreedingPlan) => p.buckSource === "herd" ? (byId.get(p.buckRefId ?? -1)?.barnName || shortName(byId.get(p.buckRefId ?? -1)?.name ?? p.buck ?? "")) : p.buck || "Other (not named yet)";

  const list = does.filter((d) => {
    const p = planFor.get(d.id);
    if (show === "open" && p?.buckSource) return false;
    if (show === "planned" && !p?.buckSource) return false;
    const t = low(q);
    return !t || [d.name, d.barnName, d.tag, d.regNumber, d.breed, d.sire, d.dam, p?.buck, d.tattooLeft, d.tattooRight].some((x) => low(x).includes(t));
  });
  const planned = does.filter((d) => planFor.get(d.id)?.buckSource);

  // How many does are planned to each buck; for the tank, compare to straws on hand
  const perBuck = useMemo(() => {
    const m = new Map<string, { label: string; n: number; tank?: OutsideBuck }>();
    for (const d of planned) {
      const p = planFor.get(d.id)!;
      const k = keyOf(p) === "other" ? `other:${low(p.buck)}` : keyOf(p);
      const e = m.get(k) ?? { label: buckLabel(p), n: 0, tank: p.buckSource === "frozen" ? outside.find((o) => o.id === p.buckRefId) : undefined };
      e.n++; m.set(k, e);
    }
    return Array.from(m.values()).sort((a, b) => b.n - a.n);
  }, [plans, season, animals, outside]); // eslint-disable-line

  // Breedings already recorded this season for a doe
  const bredThisSeason = (doeId: number) => breedings.filter((b) => b.doeId === doeId && b.date.startsWith(season)).sort((a, b) => b.date.localeCompare(a.date))[0];

  const parentCell = (text?: string | null) => {
    if (!text) return <span className="text-muted-foreground">—</span>;
    const g = findParent(text, animals);
    return g ? <Link href={`/animal/${g.id}`} className="text-primary hover:underline">{goatName(g)}</Link> : <span>{shortName(text)}</span>;
  };

  return (
    <>
      <div className="mb-2 print:hidden"><Link href="/breeding" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary" data-testid="link-back-breeding"><ArrowLeft className="h-4 w-4" />Breeding</Link></div>
      <PageHeader title="Breeding plan" sub="Pick a buck for each doe. Choose from your herd bucks, the tank, a guest buck, or Other.">
        <select value={season} onChange={(e) => setSeason(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm font-semibold print:hidden" aria-label="Season" data-testid="select-plan-season">
          {seasons.map((s) => <option key={s} value={s}>{s} season</option>)}
        </select>
        <Button variant="outline" onClick={() => window.print()} className="print:hidden" data-testid="button-print-plan"><Printer />Print</Button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Does" value={does.length} />
        <Stat label="Buck picked" value={planned.length} />
        <Stat label="Still open" value={does.length - planned.length} />
        <Stat label="Bred so far" value={does.filter((d) => bredThisSeason(d.id)).length} />
      </div>

      {perBuck.length > 0 && (
        <div className="mb-4 rounded-lg border bg-card p-3" data-testid="card-plan-bucks">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Does per buck</div>
          <div className="flex flex-wrap gap-2">
            {perBuck.map((b) => {
              const short = b.tank && (b.tank.strawsOnHand ?? 0) < b.n;
              return (
                <span key={b.label} className={`rounded-md border px-2 py-1 text-xs ${short ? "border-amber-500 bg-amber-500/10" : ""}`}>
                  {b.tank && <Snowflake className="mr-1 inline h-3 w-3 text-sky-600" />}<span className="font-semibold">{b.label}</span> · {b.n} doe{b.n === 1 ? "" : "s"}
                  {b.tank && <span className={short ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground"}> · {b.tank.strawsOnHand ?? 0} straw{(b.tank.strawsOnHand ?? 0) === 1 ? "" : "s"} on hand</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search doe, barn name, sire, dam, buck…" className="pl-8" data-testid="input-plan-search" />
        </div>
        {([["all", "All"], ["open", "No buck yet"], ["planned", "Buck picked"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setShow(k)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${show === k ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary"}`} data-testid={`chip-plan-${k}`}>{l}</button>
        ))}
      </div>

      {does.length === 0 ? <Empty icon={ClipboardList} title="No does in the herd">Add does on the Herd page to plan breedings.</Empty> : list.length === 0 ? (
        <Empty icon={Search} title="No does match">Try a different search or filter.</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_6.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground md:grid">
            <div>Doe</div><div>Birth date</div><div>Dam</div><div>Sire</div><div>Buck to use</div>
          </div>
          <ul data-testid="list-breeding-plan">
            {list.map((d) => {
              const p = planFor.get(d.id);
              const k = keyOf(p);
              const buckAnimal = p?.buckSource === "herd" ? byId.get(p.buckRefId ?? -1) ?? null : null;
              const rel = p?.buckSource ? relation(d, p.buckSource === "herd" ? buckAnimal?.name ?? "" : p.buck ?? "", buckAnimal, animals) : null;
              const bred = bredThisSeason(d.id);
              const tankBuck = p?.buckSource === "frozen" ? outside.find((o) => o.id === p.buckRefId) : undefined;
              const ag = age(d.dob);
              return (
                <li key={d.id} className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-b px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_6.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)] md:items-center" data-testid={`row-plan-${d.id}`}>
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <Link href={`/animal/${d.id}`} className="block truncate text-sm font-semibold hover:text-primary" data-testid={`link-plan-doe-${d.id}`}>{goatName(d)}</Link>
                    <div className="truncate text-xs text-muted-foreground">{[d.barnName && low(d.barnName) !== low(d.name) ? d.name : null, d.breed].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="col-span-2 text-xs md:col-span-1 md:text-sm">
                    <span className="text-muted-foreground md:hidden">Born </span>{d.dob ? fmtDate(d.dob) : "—"}{ag && <span className="block text-[11px] text-muted-foreground max-md:inline max-md:before:content-['_·_']">{ag}</span>}
                  </div>
                  <div className="min-w-0 truncate text-xs md:text-sm"><span className="text-muted-foreground md:hidden">Dam </span>{parentCell(d.dam)}</div>
                  <div className="min-w-0 truncate text-xs md:text-sm"><span className="text-muted-foreground md:hidden">Sire </span>{parentCell(d.sire)}</div>
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <select value={k} onChange={(e) => choose(d, e.target.value)} className={`h-9 w-full rounded-md border px-2 text-sm print:hidden ${k ? "bg-primary/5 font-semibold" : "bg-background text-muted-foreground"}`} aria-label={`Buck for ${d.barnName || d.name}`} data-testid={`select-plan-buck-${d.id}`}>
                      <option value="">Select a buck</option>
                      {herdBucks.length > 0 && <optgroup label="Our bucks">{herdBucks.map((b) => <option key={b.id} value={`herd:${b.id}`}>{goatName(b)}{b.breed ? ` · ${b.breed}` : ""}</option>)}</optgroup>}
                      {tank.length > 0 && <optgroup label="Tank (AI)">{tank.map((b) => <option key={b.id} value={`frozen:${b.id}`}>{goatName(b)} · {b.strawsOnHand ?? 0} straw{(b.strawsOnHand ?? 0) === 1 ? "" : "s"}</option>)}</optgroup>}
                      {guests.length > 0 && <optgroup label="Guest bucks">{guests.map((b) => <option key={b.id} value={`guest:${b.id}`}>{goatName(b)}{b.farm ? ` · ${b.farm}` : ""}</option>)}</optgroup>}
                      <option value="other">Other (type a guest buck)</option>
                    </select>
                    <span className="hidden text-sm font-semibold print:inline">{p?.buckSource ? buckLabel(p) : "________________"}</span>
                    {k === "other" && (
                      <Input autoFocus={otherFor[d.id] !== undefined && !p?.buck} value={otherFor[d.id] ?? p?.buck ?? ""} onChange={(e) => setOtherFor({ ...otherFor, [d.id]: e.target.value })}
                        onBlur={() => { const v = (otherFor[d.id] ?? p?.buck ?? "").trim(); if (v !== (p?.buck ?? "")) save(d, { key: "other", source: "other", refId: null, name: v }); }}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        placeholder="Guest buck name and farm" className="mt-1.5 h-8 text-sm print:hidden" data-testid={`input-plan-other-${d.id}`} />
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {p?.notes && <span className="text-[11px] text-muted-foreground" data-testid={`text-plan-notes-${d.id}`}>Plan: {p.notes}</span>}
                      {rel && <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400" data-testid={`text-plan-related-${d.id}`}><AlertTriangle className="h-3 w-3" />{rel}</span>}
                      {tankBuck && (tankBuck.strawsOnHand ?? 0) === 0 && <span className="text-[11px] font-semibold text-amber-700">No straws left</span>}
                      {bred ? <Badge variant="secondary" className="text-[11px]">Bred {fmtShort(bred.date)} to {shortName(bred.buck)}</Badge>
                        : p?.buckSource && <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] print:hidden" data-testid={`button-plan-breed-${d.id}`}
                            onClick={() => setBreed({ doeId: d.id, preset: p.buckSource !== "other" && p.buckRefId ? { buckSource: p.buckSource!, buckRefId: p.buckRefId, buck: p.buckSource === "herd" ? byId.get(p.buckRefId)?.name ?? p.buck ?? "" : p.buck ?? "" } : undefined })}>
                            <Heart className="h-3 w-3" />Record breeding</Button>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground print:hidden">Picks save as you go. A warning shows when the buck is her sire, grandsire, son or a brother, based on your herd records and her pedigree.</p>
      <BreedingDialog open={!!breed} onOpenChange={(o) => !o && setBreed(null)} doeId={breed?.doeId} preset={breed?.preset} />
    </>
  );
}
