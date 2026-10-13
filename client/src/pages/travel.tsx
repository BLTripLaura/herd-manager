import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Truck, Plus, Search, X, Printer, FileSpreadsheet, Send, Trash2, AlertTriangle, ChevronLeft, Settings2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, Empty } from "@/components/shell";
import { Field, Pick } from "@/components/forms";
import { ConfirmDelete } from "@/components/confirm-delete";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useList, today, fmtDate, goatName, type Animal, type Trip } from "@/lib/herd";
import { ORIGIN_KEY, PURPOSES, idsOf, rows, problems, workbook, printHtml, destText, originText, ageAt, type Origin } from "@/lib/cvi";
import { canShareFile } from "@/lib/docs";

const useOrigin = () => useQuery<{ value: Origin | null }>({ queryKey: ORIGIN_KEY });
const blankTrip = (): any => ({ shipDate: today(), purpose: "Exhibition / show", destName: "", animalIds: "" });

function OriginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data } = useOrigin(); const { toast } = useToast();
  const [v, setV] = useState<Origin>({});
  useEffect(() => { if (open) setV(data?.value ?? {}); }, [open]); // eslint-disable-line
  const f = (k: keyof Origin, label: string, cls = "", ph = "") => <Field label={label} className={cls}><Input value={v[k] ?? ""} placeholder={ph} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} data-testid={`input-origin-${k}`} /></Field>;
  const save = async () => { await apiRequest("PUT", "/api/settings/cviOrigin", { value: v }); queryClient.invalidateQueries({ queryKey: ORIGIN_KEY }); toast({ title: "Farm details saved" }); onOpenChange(false); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Your farm on the CVI</DialogTitle><DialogDescription>The consignor and origin. Entered once and put on every travel list.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {f("owner", "Owner name", "col-span-2")}{f("farm", "Farm name", "col-span-2")}{f("address", "Street address", "col-span-2")}
          {f("city", "City")}<div className="grid grid-cols-2 gap-2">{f("state", "State", "", "DE")}{f("zip", "ZIP")}</div>
          {f("phone", "Phone")}{f("email", "Email")}
          {f("premisesId", "Premises ID (PIN)", "", "Optional")}{f("flockId", "Scrapie flock ID", "", "Optional")}
          {f("vetName", "Vet / clinic", "", "Optional")}{f("vetEmail", "Vet email", "", "For sending the list")}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} data-testid="button-save-origin">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TripList() {
  const { data: trips, isLoading } = useList("trips");
  const { data: animals = [] } = useList("animals");
  const [, go] = useLocation();
  const [farm, setFarm] = useState(false);
  const list = [...(trips ?? [])].sort((a, b) => (a.shipDate < b.shipDate ? 1 : -1));
  const t = today();
  return (
    <>
      <PageHeader title="Travel lists (CVI)" sub="Pick the goats going to a show or sale, then send the list to your vet for the GlobalVetLink health certificate.">
        <Button variant="outline" onClick={() => setFarm(true)} data-testid="button-farm-details"><Settings2 />Farm details</Button>
        <Button onClick={() => go("/travel/new")} data-testid="button-new-trip"><Plus />New travel list</Button>
      </PageHeader>
      {isLoading ? <Skeleton className="h-24" /> : !list.length ? <Empty icon={Truck} title="No travel lists yet">Start one with New travel list.</Empty> : (
        <ul className="overflow-hidden rounded-lg border bg-card">
          {list.map((tr) => { const n = idsOf(tr).length; return (
            <li key={tr.id} className="border-b last:border-b-0">
              <button type="button" onClick={() => go(`/travel/${tr.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover-elevate" data-testid={`row-trip-${tr.id}`}>
                <Truck className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{tr.destName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{fmtDate(tr.shipDate)} · {tr.purpose} · {n} goat{n === 1 ? "" : "s"}{tr.destCity || tr.destState ? ` · ${[tr.destCity, tr.destState].filter(Boolean).join(", ")}` : ""}</span></span>
                {tr.shipDate >= t && <Badge variant="secondary">Upcoming</Badge>}
              </button>
            </li>
          ); })}
        </ul>
      )}
      {animals.length === 0 ? null : null}
      <OriginDialog open={farm} onOpenChange={setFarm} />
    </>
  );
}

function TripEditor({ id }: { id: number | null }) {
  const { data: trips } = useList("trips");
  const { data: animals = [] } = useList("animals");
  const { data: treatments = [] } = useList("treatments");
  const { data: breedings = [] } = useList("breedings");
  const { data: origin } = useOrigin();
  const [, go] = useLocation();
  const { toast } = useToast();
  const saved = id ? trips?.find((t) => t.id === id) : null;
  const [v, setV] = useState<any>(blankTrip());
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [del, setDel] = useState(false);
  const [farm, setFarm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (saved) { setV({ ...saved }); setDirty(false); } }, [saved?.id]); // eslint-disable-line
  const set = (k: string) => (x: any) => { setV((p: any) => ({ ...p, [k]: x })); setDirty(true); };
  const ids = idsOf(v);
  const byId = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);
  const chosen = ids.map((i) => byId.get(i)).filter(Boolean) as Animal[];
  const hay = (a: Animal) => [goatName(a), a.name, a.regNumber, a.tattooRight, a.tattooLeft, a.microchip, a.tag, a.breed].join(" ").toLowerCase();
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase(); if (!s) return [];
    return animals.filter((a) => (showAll || a.status === "active") && !ids.includes(a.id) && hay(a).includes(s)).sort((a, b) => goatName(a).localeCompare(goatName(b))).slice(0, 12);
  }, [q, animals, ids.join(","), showAll]); // eslint-disable-line
  const add = (a: Animal) => { set("animalIds")([...ids, a.id].join(",")); setQ(""); };
  const remove = (aid: number) => set("animalIds")(ids.filter((x) => x !== aid).join(","));
  const o: Origin = origin?.value ?? {};
  const need = !v.shipDate ? "the date" : !String(v.destName ?? "").trim() ? "the destination" : !v.purpose ? "the purpose" : "";
  const save = async (quiet = false) => {
    if (need) { toast({ title: `Enter ${need}`, variant: "destructive" }); return null; }
    const { id: _i, ...body } = v;
    const r: Trip = await (id ? apiRequest("PATCH", `/api/trips/${id}`, body) : apiRequest("POST", "/api/trips", body)).then((x) => x.json());
    queryClient.invalidateQueries({ queryKey: ["/api/trips"] }); setDirty(false);
    if (!quiet) toast({ title: "Travel list saved" });
    if (!id) go(`/travel/${r.id}`, { replace: true });
    return r;
  };
  const ready = async () => {
    if (!chosen.length) { toast({ title: "Add at least one goat", variant: "destructive" }); return null; }
    const t = dirty || !id ? await save(true) : (saved as Trip);
    if (!t) return null;
    if (!o.owner && !o.farm) toast({ title: "Tip: add your farm details", description: "Your name and address go on the CVI as the consignor." });
    return { t: { ...t, ...v, id: t.id } as Trip, list: rows(v, animals, treatments, breedings) };
  };
  const excel = async () => { setBusy(true); try { const r = await ready(); if (!r) return; const f = await workbook(r.t, o, r.list); const u = URL.createObjectURL(f); const a = document.createElement("a"); a.href = u; a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 30000); } finally { setBusy(false); } };
  const print = async () => { const w = window.open("", "_blank"); const r = await ready(); if (!r) { w?.close(); return; } if (!w) return toast({ title: "Allow pop-ups to print", variant: "destructive" }); w.document.write(printHtml(r.t, o, r.list)); w.document.close(); };
  const send = async () => {
    setBusy(true);
    try {
      const r = await ready(); if (!r) return;
      const f = await workbook(r.t, o, r.list);
      const subject = `CVI request: ${r.list.length} goat${r.list.length === 1 ? "" : "s"} to ${r.t.destName} on ${fmtDate(r.t.shipDate)}`;
      const body = `Hello${o.vetName ? ` ${o.vetName}` : ""},\n\nPlease prepare a CVI for ${r.list.length} goat${r.list.length === 1 ? "" : "s"}.\nShip date: ${fmtDate(r.t.shipDate)}\nPurpose: ${r.t.purpose}\nDestination: ${destText(r.t)}\nOrigin: ${originText(o)}\n\nThe goat list (IDs, tattoos, microchips, breed, sex, age, color) is attached.\n\nThank you,\n${o.owner ?? ""}`;
      if (canShareFile(f)) { try { await navigator.share({ files: [f], title: subject, text: body }); return; } catch (e: any) { if (e?.name === "AbortError") return; } }
      const u = URL.createObjectURL(f); const a = document.createElement("a"); a.href = u; a.download = f.name; a.click();
      window.location.href = `mailto:${encodeURIComponent(o.vetEmail ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + "\n\n(Attach the downloaded file: " + f.name + ")")}`;
      toast({ title: "List downloaded", description: "Attach it to the email that just opened." });
    } finally { setBusy(false); }
  };
  const copyTrip = async () => { const { id: _i, ...rest } = v; const r: Trip = await apiRequest("POST", "/api/trips", { ...rest, shipDate: today(), returnDate: null }).then((x) => x.json()); queryClient.invalidateQueries({ queryKey: ["/api/trips"] }); toast({ title: "Copied", description: "Same goats and destination. Check the date." }); go(`/travel/${r.id}`); };
  if (id && !trips) return <Skeleton className="h-64" />;
  if (id && trips && !saved) return <Empty icon={Truck} title="Travel list not found"><Button variant="outline" onClick={() => go("/travel")}>Back</Button></Empty>;
  const warn = chosen.map((a) => ({ a, p: problems(a) })).filter((x) => x.p.length);
  return (
    <>
      <button type="button" onClick={() => go("/travel")} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-travel"><ChevronLeft className="h-4 w-4" />Travel lists</button>
      <PageHeader title={id ? v.destName || "Travel list" : "New travel list"} sub={`${chosen.length} goat${chosen.length === 1 ? "" : "s"}${v.shipDate ? ` · ${fmtDate(v.shipDate)}` : ""}${v.purpose ? ` · ${v.purpose}` : ""}`}>
        <Button variant="outline" onClick={print} disabled={busy} data-testid="button-print-trip"><Printer />Print</Button>
        <Button variant="outline" onClick={excel} disabled={busy} data-testid="button-excel-trip"><FileSpreadsheet />Excel</Button>
        <Button onClick={send} disabled={busy} data-testid="button-send-trip"><Send />Send to vet</Button>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="rounded-lg border bg-card p-4" data-testid="card-trip-details">
          <h2 className="mb-3 text-sm font-bold">Trip</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of travel *"><Input type="date" value={v.shipDate ?? ""} onChange={(e) => set("shipDate")(e.target.value)} data-testid="input-trip-date" /></Field>
            <Field label="Return date"><Input type="date" value={v.returnDate ?? ""} onChange={(e) => set("returnDate")(e.target.value || null)} data-testid="input-trip-return" /></Field>
            <Field label="Purpose *" className="col-span-2"><Pick value={v.purpose} onChange={set("purpose")} options={PURPOSES.map((p) => ({ value: p, label: p }))} testId="select-trip-purpose" /></Field>
            <Field label="Destination *" className="col-span-2" hint="Show, fairground, farm or buyer"><Input value={v.destName ?? ""} onChange={(e) => set("destName")(e.target.value)} placeholder="e.g., Delaware State Fair" data-testid="input-trip-dest" /></Field>
            <Field label="Street address" className="col-span-2"><Input value={v.destAddress ?? ""} onChange={(e) => set("destAddress")(e.target.value)} data-testid="input-trip-address" /></Field>
            <Field label="City"><Input value={v.destCity ?? ""} onChange={(e) => set("destCity")(e.target.value)} data-testid="input-trip-city" /></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="State"><Input value={v.destState ?? ""} onChange={(e) => set("destState")(e.target.value)} placeholder="MD" data-testid="input-trip-state" /></Field><Field label="ZIP"><Input value={v.destZip ?? ""} onChange={(e) => set("destZip")(e.target.value)} data-testid="input-trip-zip" /></Field></div>
            <Field label="Contact at destination"><Input value={v.consignee ?? ""} onChange={(e) => set("consignee")(e.target.value)} placeholder="Optional" data-testid="input-trip-consignee" /></Field>
            <Field label="Phone"><Input value={v.destPhone ?? ""} onChange={(e) => set("destPhone")(e.target.value)} placeholder="Optional" data-testid="input-trip-phone" /></Field>
            <Field label="Carrier" className="col-span-2"><Input value={v.carrier ?? ""} onChange={(e) => set("carrier")(e.target.value)} placeholder="e.g., Owner's truck and trailer" data-testid="input-trip-carrier" /></Field>
            <Field label="Notes" className="col-span-2"><Textarea rows={2} value={v.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} placeholder="Optional · entry permit number, show rules" data-testid="input-trip-notes" /></Field>
          </div>
          <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center justify-between"><span className="font-semibold text-foreground">From (consignor)</span><button type="button" className="text-primary underline" onClick={() => setFarm(true)} data-testid="button-edit-origin">Edit</button></div>
            {originText(o) || "Add your name, farm address and phone so they go on the list."}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => save()} disabled={!dirty && !!id} data-testid="button-save-trip">{id ? (dirty ? "Save changes" : "Saved") : "Save travel list"}</Button>
            {id && <Button variant="outline" onClick={copyTrip} data-testid="button-copy-trip"><Copy />Copy for a new trip</Button>}
            {id && <Button variant="ghost" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => setDel(true)} data-testid="button-delete-trip"><Trash2 />Delete</Button>}
          </div>
        </section>
        <section className="rounded-lg border bg-card p-4" data-testid="card-trip-goats">
          <h2 className="mb-3 text-sm font-bold">Goats going ({chosen.length})</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type part of a name, tattoo, reg # or chip" data-testid="input-trip-search"
              onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { e.preventDefault(); add(matches[0]); } }} />
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />Include sold and other non-active goats</label>
          {q.trim() && (
            <ul className="mt-2 max-h-72 overflow-y-auto rounded-md border" data-testid="list-trip-matches">
              {matches.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">No goats match “{q}”.</li> : matches.map((a) => (
                <li key={a.id}><button type="button" onClick={() => add(a)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover-elevate" data-testid={`button-add-goat-${a.id}`}>
                  <Plus className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 truncate"><b>{goatName(a)}</b> <span className="text-muted-foreground">{[a.name !== goatName(a) ? a.name : "", a.breed, a.sex].filter(Boolean).join(" · ")}</span></span>
                </button></li>
              ))}
            </ul>
          )}
          {warn.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs" data-testid="trip-warnings">
              <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" />Check before sending</div>
              <ul className="space-y-0.5">{warn.map(({ a, p }) => <li key={a.id}><b>{goatName(a)}</b>: {p.join("; ")}</li>)}</ul>
            </div>
          )}
          {chosen.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Search above and tap a goat to add it.</p> : (
            <ul className="mt-3 divide-y rounded-md border" data-testid="list-trip-goats">
              {chosen.map((a, i) => (
                <li key={a.id} className="flex items-start gap-3 px-3 py-2.5" data-testid={`row-trip-goat-${a.id}`}>
                  <span className="mt-0.5 w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-semibold">{goatName(a)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[a.name !== goatName(a) ? a.name : "", a.regNumber, a.breed, a.sex, ageAt(a.dob, v.shipDate || today())].filter(Boolean).join(" · ")}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[a.tattooRight || a.tattooLeft ? `Tattoo ${[a.tattooRight, a.tattooLeft].filter(Boolean).join(" / ")}${a.tattooLocation === "tail" ? " (tail)" : ""}` : "", a.microchip ? `Chip ${a.microchip}` : "", a.tag ? `Tag ${a.tag}` : "", a.color].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Button variant="ghost" size="icon" aria-label={`Take ${goatName(a)} off the list`} onClick={() => remove(a.id)} data-testid={`button-remove-goat-${a.id}`}><X /></Button>
                </li>
              ))}
            </ul>
          )}
          {chosen.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Registry tattoos count as official ID only when the registration papers travel with the goat.</p>}
        </section>
      </div>
      <OriginDialog open={farm} onOpenChange={setFarm} />
      <ConfirmDelete open={del} onOpenChange={setDel} testId="button-confirm-delete-trip" title="Delete this travel list?" body="The goats are not changed. This can't be undone and is noted in the system log."
        onConfirm={async () => { await apiRequest("DELETE", `/api/trips/${id}`); queryClient.invalidateQueries({ queryKey: ["/api/trips"] }); toast({ title: "Travel list deleted" }); go("/travel"); }} />
    </>
  );
}

export default function TravelPage() {
  const [, p] = useRoute("/travel/:id");
  if (!p) return <TripList />;
  return <TripEditor key={p.id} id={p.id === "new" ? null : Number(p.id)} />;
}
