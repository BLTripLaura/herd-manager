import { useState } from "react";
import { Link } from "wouter";
import { Snowflake, Plus, Pencil, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Empty, Stat } from "@/components/shell";
import { OutsideBuckDialog, PedigreeLink, BreedingDialog } from "@/components/forms";
import { useList, fmtShort, shortName, type OutsideBuck, goatName, regName } from "@/lib/herd";

const LOW = 2;

export default function TankPage() {
  const { data: outside = [] } = useList("outsideBucks");
  const { data: breedings = [] } = useList("breedings");
  const { data: animals = [] } = useList("animals");
  const [dlg, setDlg] = useState<{ open: boolean; b?: OutsideBuck }>({ open: false });
  const [breed, setBreed] = useState(false);
  const byId = new Map(animals.map((a) => [a.id, a]));
  const tank = outside.filter((b) => b.kind === "frozen").sort((a, b) => (a.canister ?? "").localeCompare(b.canister ?? "") || a.name.localeCompare(b.name));
  const usesFor = (id: number) => breedings.filter((b) => b.buckSource === "frozen" && b.buckRefId === id).sort((a, b) => b.date.localeCompare(a.date));
  const totalOnHand = tank.reduce((s, b) => s + (b.strawsOnHand ?? 0), 0);
  const totalUsed = breedings.filter((b) => b.buckSource === "frozen").reduce((s, b) => s + (b.straws ?? 0), 0);
  const low = tank.filter((b) => (b.strawsOnHand ?? 0) <= LOW).length;

  return (
    <>
      <PageHeader title="Tank inventory" sub="Frozen semen on hand. Each AI breeding deducts the straws used.">
        <Button variant="outline" onClick={() => setBreed(true)} data-testid="button-record-ai"><Heart />Record AI breeding</Button>
        <Button onClick={() => setDlg({ open: true })} data-testid="button-add-frozen"><Plus />Add frozen buck</Button>
      </PageHeader>
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Straws on hand" value={totalOnHand} hint={`${tank.length} bucks`} />
        <Stat label="Straws used" value={totalUsed} />
        <Stat label="Low or out" value={low} hint={`${LOW} or fewer`} tone={low ? "warn" : undefined} />
      </div>
      {tank.length === 0 ? (
        <Empty icon={Snowflake} title="No frozen bucks yet">Add each buck in your tank with his starting number of straws.</Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {tank.map((b) => {
            const uses = usesFor(b.id);
            const start = b.startingStraws ?? 0;
            const onHand = b.strawsOnHand ?? 0;
            const pct = start ? Math.min(100, (onHand / start) * 100) : 0;
            const tone = onHand === 0 ? "bg-destructive" : onHand <= LOW ? "bg-amber-500" : "bg-primary";
            return (
              <li key={b.id} className="rounded-lg border bg-card p-4" data-testid={`card-tank-${b.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{goatName(b)}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {b.regNumber && <span>Reg {b.regNumber}</span>}
                      {b.farm && <span>{b.farm}</span>}
                      {b.canister && <span>{b.canister}</span>}
                      {b.collectionDate && <span>Collected {fmtShort(b.collectionDate)}</span>}
                    </div>
                    <div className="mt-1">
                      {b.pedigreeUrl ? <PedigreeLink url={b.pedigreeUrl} />
                        : <button className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setDlg({ open: true, b })}>Add pedigree link</button>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xl font-bold tabular-nums" data-testid={`text-onhand-${b.id}`}>{onHand}</div>
                    <div className="text-xs text-muted-foreground">of {start} straws</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {onHand === 0 ? <Badge variant="destructive">Out</Badge> : onHand <= LOW ? <Badge className="bg-amber-500 text-white hover:bg-amber-500">Low</Badge> : null}
                    {!b.active && <Badge variant="outline">Not available</Badge>}
                    <Badge variant="secondary">{start - onHand} used</Badge>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setDlg({ open: true, b })} data-testid={`button-edit-tank-${b.id}`}><Pencil />Edit</Button>
                </div>
                {uses.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t pt-2">
                    {uses.map((u) => {
                      const doe = byId.get(u.doeId);
                      return (
                        <li key={u.id} className="flex items-center justify-between gap-2 text-xs">
                          <Link href={`/animal/${u.doeId}`} className="truncate font-medium hover:text-primary">{doe ? goatName(doe) : "Unknown doe"}</Link>
                          <span className="shrink-0 text-muted-foreground">{fmtShort(u.date)} · {u.straws} straw{u.straws === 1 ? "" : "s"} · {u.status}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Used counts include every AI breeding recorded, whether or not the doe settled. Editing or deleting a breeding puts its straws back.</p>
      <OutsideBuckDialog open={dlg.open} kind="frozen" buck={dlg.b} onOpenChange={(o) => setDlg({ open: o, b: o ? dlg.b : undefined })} />
      <BreedingDialog open={breed} onOpenChange={setBreed} method="AI" />
    </>
  );
}
