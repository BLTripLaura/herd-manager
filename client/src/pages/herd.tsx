import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Search, Plus, Layers, X, AlertTriangle, Rabbit, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, Empty, useApp } from "@/components/shell";
import { AnimalDialog } from "@/components/forms";
import { ScanPapersButton } from "@/components/papers";
import { useList, matchesAnimal, latestWeight, activeHolds, age, shortName, idMatch, fmtChip, fmtShort, relDays, today, daysBetween, breedKey, colorWords, breedOptions, colorOptions, daysInMilk, type IdHit, goatName, regName } from "@/lib/herd";
import { MilkBadge } from "@/components/milk-status";
import { useThumbs } from "@/components/photos";
import { cn } from "@/lib/utils";
import { Pick } from "@/components/forms";

/** Index in a spaced string where the last n digits begin */
function tailCut(s: string, n: number) { let c = 0; for (let i = s.length - 1; i >= 0; i--) { if (/\d/.test(s[i])) c++; if (c === n) return i; } return 0; }

function Chip({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button onClick={onClick} data-testid={testId}
      className={cn("rounded-full border px-3 py-1 text-xs font-medium hover-elevate",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
      {children}
    </button>
  );
}

export default function Herd() {
  const { data: animals, isLoading } = useList("animals");
  const { data: weights = [] } = useList("weights");
  const { data: treatments = [] } = useList("treatments");
  const { data: pastures = [] } = useList("pastures");
  const { data: lactations = [] } = useList("lactations");
  const pName = (id?: number | null) => pastures.find((p) => p.id === id)?.name ?? "";
  const [pasture, setPasture] = useState<string>("all");
  const { selected, setSelected, herdQ, setHerdQ } = useApp();
  const [, nav] = useLocation();
  const [q, setQ] = useState("");
  // "See all" from the top search bar hands its words to this list
  useEffect(() => { if (herdQ) { setQ(herdQ); setStatus("all"); setHerdQ(""); } }, [herdQ]); // eslint-disable-line
  const [sex, setSex] = useState<string>("all");
  const [status, setStatus] = useState<string>("active");
  const [group, setGroup] = useState<string>("all");
  const [breed, setBreed] = useState<string>("all");
  const [color, setColor] = useState<string>("all");
  const [adding, setAdding] = useState(false);

  const { data: breedings = [] } = useList("breedings");
  const [, vp] = useRoute("/herd/:view");
  const view = vp?.view as "active" | "milking" | "milk-holds" | "kidding" | undefined;
  const all = animals ?? [];
  const groups = useMemo(() => Array.from(new Set(all.map((a) => a.groupName).filter(Boolean))) as string[], [all]);
  const holds = activeHolds(treatments, animals ?? []);
  const bKey = breedKey;
  const breeds = useMemo(() => breedOptions(all), [all]);
  const colors = useMemo(() => colorOptions(all, breed), [all, breed]);
  // Preset views from the Today summary boxes
  const t = today();
  const kidding = new Map<number, string>();
  for (const b of breedings) if (b.status === "confirmed" && b.dueDate && daysBetween(t, b.dueDate) <= 30 && daysBetween(t, b.dueDate) >= -7) {
    const cur = kidding.get(b.doeId); if (!cur || b.dueDate < cur) kidding.set(b.doeId, b.dueDate);
  }
  const dimMap = useMemo(() => { const m = new Map<number, number | null>(); for (const a of all) if (a.sex === "doe" && a.inMilk) m.set(a.id, daysInMilk(a.id, lactations).current); return m; }, [all, lactations]);
  const dimOf = (id: number) => dimMap.get(id) ?? null;
  const VIEWS = {
    active: { title: "Active animals", test: (a: typeof all[number]) => a.status === "active" },
    milking: { title: "In milk", test: (a: typeof all[number]) => a.status === "active" && !!a.inMilk },
    "milk-holds": { title: "Milk holds", test: (a: typeof all[number]) => holds.milk.has(a.id) },
    kidding: { title: "Kidding in 30 days", test: (a: typeof all[number]) => kidding.has(a.id) },
  } as const;
  const v = view && VIEWS[view] ? VIEWS[view] : null;
  const single = q.trim() && !/\s/.test(q.trim());
  const hits = new Map<number, IdHit>();
  if (single) for (const a of all) { const h = idMatch(a, q); if (h) hits.set(a.id, h); }
  const list = all
    .filter((a) => (v ? v.test(a) : status === "all" || a.status === status) && (sex === "all" || a.sex === sex) && (group === "all" || a.groupName === group) && (pasture === "all" || String(a.pastureId ?? "none") === pasture) && (breed === "all" || bKey(a.breed) === breed) && (color === "all" || colorWords(a.color).includes(color)) && (hits.has(a.id) || matchesAnimal(a, q, pName(a.pastureId))))
    .sort((a, b) => (hits.get(b.id)?.score ?? 0) - (hits.get(a.id)?.score ?? 0) ||
      (view === "kidding" ? (kidding.get(a.id) ?? "").localeCompare(kidding.get(b.id) ?? "") : 0) ||
      (view === "milk-holds" ? (holds.milk.get(a.id)?.milkClearDate ?? "").localeCompare(holds.milk.get(b.id)?.milkClearDate ?? "") : 0) || (a.tag ?? "").localeCompare(b.tag ?? "", undefined, { numeric: true }) || a.name.localeCompare(b.name));
  // ID lookup suggestions: across the whole herd (ignores filters), best matches first
  const idList = single ? all.filter((a) => hits.has(a.id)).sort((a, b) => hits.get(b.id)!.score - hits.get(a.id)!.score || a.name.localeCompare(b.name)).slice(0, 8) : [];
  const thumbs = useThumbs(list.map((a) => a.photoId).filter(Boolean) as number[]).data ?? {};

  const sel = new Set(selected);
  const toggle = (id: number) => setSelected(sel.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const allVisibleSelected = list.length > 0 && list.every((a) => sel.has(a.id));

  return (
    <>
      <PageHeader title="Herd" sub={`${all.filter((a) => a.status === "active").length} active animals`}>
        <Button variant="outline" asChild data-testid="button-import-herd"><Link href="/data"><Upload />Import</Link></Button>
        <ScanPapersButton />
        <Button onClick={() => setAdding(true)} data-testid="button-add-animal"><Plus />Add animal</Button>
      </PageHeader>

      {v && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5" data-testid="banner-view">
          <div className="min-w-0 text-sm"><span className="text-muted-foreground">Showing </span><b>{v.title}</b><span className="text-muted-foreground"> · {list.length} {list.length === 1 ? "goat" : "goats"}{list.length ? " · tap a goat to open her record" : ""}</span></div>
          <Button variant="ghost" size="sm" asChild className="shrink-0"><Link href="/herd" data-testid="button-clear-view"><X />Show all</Link></Button>
        </div>
      )}

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, tattoo, microchip, tag, reg #, pasture…"
          className="h-11 pl-9 text-base" data-testid="input-search" />
        {q && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setQ("")} aria-label="Clear search"><X className="h-4 w-4" /></button>}
      </div>

      {idList.length > 0 && (
        <div className="mb-3 overflow-hidden rounded-lg border border-primary/30 bg-card" data-testid="card-id-matches">
          <div className="border-b bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">Tattoo / microchip / tag matches for “{q.trim().toUpperCase()}” <span className="font-normal text-muted-foreground">· tap to open</span></div>
          <ul className="divide-y">
            {idList.map((a) => {
              const h = hits.get(a.id)!;
              const t = q.trim().toUpperCase();
              const shown = h.field === "microchip" ? fmtChip(h.value) : h.value;
              const i = h.field === "microchip" ? -1 : shown.indexOf(t);
              const chipTail = h.field === "microchip" && h.value.endsWith(t.replace(/\D/g, ""));
              return (
                <li key={a.id}>
                  <Link href={`/animal/${a.id}`} className="flex items-center gap-3 px-3 py-2.5 hover-elevate" data-testid={`link-idmatch-${a.id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{goatName(a)}{regName(a) && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{regName(a)}</span>} {a.status !== "active" && <span className="font-normal capitalize text-muted-foreground">· {a.status}</span>}</div>
                      <div className="truncate text-xs text-muted-foreground">{h.label}: <span className="font-mono text-foreground">
                        {h.field === "microchip" && chipTail ? (() => { const k = tailCut(shown, t.replace(/\D/g, "").length); return <>{shown.slice(0, k)}<mark className="rounded bg-primary/15 px-0.5 text-primary">{shown.slice(k)}</mark></>; })()
                          : i >= 0 ? <>{shown.slice(0, i)}<mark className="rounded bg-primary/15 px-0.5 text-primary">{shown.slice(i, i + t.length)}</mark>{shown.slice(i + t.length)}</> : shown}
                      </span>{a.tattooLeft && h.field !== "tattooLeft" ? ` · L tattoo ${a.tattooLeft}` : ""}</div>
                    </div>
                    <span className="shrink-0 text-xs capitalize text-muted-foreground">{a.sex}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:max-w-md">
        <div className="min-w-0 flex-1"><Pick value={breed} onChange={(x) => { setBreed(x); setColor("all"); }} testId="select-breed" options={[{ value: "all", label: "All breeds" }, ...breeds.map(([k, l]) => ({ value: k, label: l }))]} /></div>
        <div className="min-w-0 flex-1"><Pick value={color} onChange={setColor} testId="select-color" options={[{ value: "all", label: "Any color" }, ...colors.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))]} /></div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[["all", "All"], ["doe", "Does"], ["buck", "Bucks"], ["wether", "Wethers"]].map(([v, l]) => <Chip key={v} active={sex === v} onClick={() => setSex(v)} testId={`chip-sex-${v}`}>{l}</Chip>)}
        {!v && <span className="mx-1 w-px bg-border" />}
        {!v && [["active", "Active"], ["sold", "Sold"], ["deceased", "Deceased"], ["all", "Any status"]].map(([v, l]) => <Chip key={v} active={status === v} onClick={() => setStatus(v)} testId={`chip-status-${v}`}>{l}</Chip>)}
        {groups.length > 0 && <span className="mx-1 w-px bg-border" />}
        {groups.length > 0 && <Chip active={group === "all"} onClick={() => setGroup("all")}>All groups</Chip>}
        {groups.map((g) => <Chip key={g} active={group === g} onClick={() => setGroup(g)} testId={`chip-group-${g}`}>{g}</Chip>)}
        {pastures.length > 0 && <span className="mx-1 w-px bg-border" />}
        {pastures.length > 0 && <Chip active={pasture === "all"} onClick={() => setPasture("all")}>All pastures</Chip>}
        {pastures.map((p) => <Chip key={p.id} active={pasture === String(p.id)} onClick={() => setPasture(String(p.id))} testId={`chip-pasture-${p.id}`}>{p.name}</Chip>)}
      </div>

      <div className="mb-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={allVisibleSelected} data-testid="checkbox-select-all"
            onCheckedChange={() => setSelected(allVisibleSelected ? selected.filter((id) => !list.some((a) => a.id === id)) : Array.from(new Set([...selected, ...list.map((a) => a.id)])))} />
          Select all shown
        </label>
        <span data-testid="text-result-count">{list.length} shown</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : list.length === 0 ? (
        v && !q.trim() && sex === "all" && group === "all" && pasture === "all" ? (
        <Empty icon={Rabbit} title={{ active: "No active animals", milking: "No goats in milk", "milk-holds": "No milk holds", kidding: "No kiddings in the next 30 days" }[view!]}>{view === "milk-holds" ? "All clear. Milk from every goat can be shipped." : view === "kidding" ? "Does show up here once a positive ultrasound confirms a due date in the next 30 days." : "Nothing to show here yet."}</Empty>
      ) : <Empty icon={Rabbit} title={all.length ? "No matches" : "No animals yet"}>{all.length ? "Try a different search or clear the filters." : "Add your first goat or import a CSV from ADGA on the Import & export page."}</Empty>
      ) : (
        <ul className="overflow-hidden rounded-lg border bg-card">
          {list.map((a) => {
            const w = latestWeight(a.id, weights);
            const hold = holds.milk.get(a.id);
            return (
              <li key={a.id} className={cn("flex items-center gap-3 border-b px-3 last:border-b-0", sel.has(a.id) && "bg-accent/60")}>
                <Checkbox checked={sel.has(a.id)} onCheckedChange={() => toggle(a.id)} aria-label={`Select ${a.name}`} data-testid={`checkbox-animal-${a.id}`} />
                <Link href={`/animal/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3" data-testid={`link-animal-${a.id}`}>
                  {a.photoId && thumbs[a.photoId]
                    ? <img src={thumbs[a.photoId]} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                    : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-bold tabular-nums">{a.tag || "—"}</div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{goatName(a)}{regName(a) && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{regName(a)}</span>}</span>
                      {hold && view !== "milk-holds" && <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-800 dark:text-amber-300"><AlertTriangle className="h-3 w-3 sm:mr-1" /><span className="sr-only sm:not-sr-only">Milk hold</span></Badge>}
                      {a.milkStatus && a.milkStatus !== "dry" && !(hold && a.milkStatus === "milking") && <MilkBadge status={a.milkStatus} className={cn("shrink-0", a.milkStatus === "milking" && "hidden sm:inline-flex")} />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      <span className="capitalize">{a.sex}</span> · {age(a.dob)}{dimOf(a.id) !== null ? ` · ${dimOf(a.id)} DIM` : ""}{(breed !== "all" || color !== "all" || q.trim()) && (a.breed || a.color) ? ` · ${[a.breed, a.color].filter(Boolean).join(", ")}` : ""}{a.groupName ? ` · ${a.groupName}` : ""}{a.pastureId && pName(a.pastureId) ? ` · ${pName(a.pastureId)}` : ""}{a.tattooLeft ? ` · L ${a.tattooLeft}` : ""}{a.tag && a.photoId ? ` · Tag ${a.tag}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {view === "kidding" && kidding.get(a.id) ? <>
                      <div className="text-sm font-semibold">Due {fmtShort(kidding.get(a.id)!)}</div>
                      <div className={cn("text-xs", kidding.get(a.id)! < t ? "font-semibold text-destructive" : "text-muted-foreground")}>{kidding.get(a.id)! < t ? "past due" : relDays(kidding.get(a.id)!)}</div>
                    </> : view === "milk-holds" && hold?.milkClearDate ? <>
                      <div className="text-sm font-semibold">Clear {fmtShort(hold.milkClearDate)}</div>
                      <div className="max-w-24 truncate text-xs text-muted-foreground">{hold.medName.split(" (")[0]}</div>
                    </> : <>
                      <div className="text-sm font-semibold tabular-nums">{w ? `${w.lbs} lb` : "—"}</div>
                      <div className="text-xs capitalize text-muted-foreground">{a.status !== "active" ? a.status : w ? "latest" : "no weight"}</div>
                    </>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg border bg-popover p-3 shadow-lg md:bottom-6 md:left-60">
          <span className="text-sm font-medium" data-testid="text-selected-count">{selected.length} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected([])} data-testid="button-clear-selection">Clear</Button>
            <Button size="sm" onClick={() => nav("/batch")} data-testid="button-batch-selected"><Layers />Batch entry</Button>
          </div>
        </div>
      )}

      <AnimalDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
