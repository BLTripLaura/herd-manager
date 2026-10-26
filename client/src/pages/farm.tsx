import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Mail, MapPin, Plus, Pencil, Trash2, Star, Stethoscope, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, Empty } from "@/components/shell";
import { Field } from "@/components/forms";
import { ConfirmDelete } from "@/components/confirm-delete";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ORIGIN_KEY, VETS_KEY, vetAddress, type Origin, type Vet } from "@/lib/cvi";

export const useOrigin = () => useQuery<{ value: Origin | null }>({ queryKey: ORIGIN_KEY });
export const useVets = () => useQuery<{ value: Vet[] | null }>({ queryKey: VETS_KEY });
const saveVets = async (list: Vet[]) => { await apiRequest("PUT", "/api/settings/vets", { value: list }); queryClient.invalidateQueries({ queryKey: VETS_KEY }); };
const mapUrl = (v: Vet) => `https://maps.apple.com/?q=${encodeURIComponent(vetAddress(v))}`;
const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-bold">{title}</h3>
      {sub && <p className="mb-3 text-xs text-muted-foreground">{sub}</p>}
      <div className={`grid grid-cols-2 gap-3 ${sub ? "" : "mt-3"}`}>{children}</div>
    </div>
  );
}

function FarmForm() {
  const { data, isLoading } = useOrigin(); const { toast } = useToast();
  const [v, setV] = useState<Origin>({}); const [dirty, setDirty] = useState(false);
  useEffect(() => { if (data) { setV(data.value ?? {}); setDirty(false); } }, [data]);
  const f = (k: keyof Origin, label: string, cls = "", ph = "", hint?: string) => (
    <Field label={label} className={cls} hint={hint}><Input value={v[k] ?? ""} placeholder={ph} onChange={(e) => { setV((p) => ({ ...p, [k]: e.target.value })); setDirty(true); }} data-testid={`input-farm-${k}`} /></Field>
  );
  const save = async () => { await apiRequest("PUT", "/api/settings/cviOrigin", { value: v }); queryClient.invalidateQueries({ queryKey: ORIGIN_KEY }); setDirty(false); toast({ title: "Farm information saved", description: "It goes on every travel list (CVI)." }); };
  if (isLoading) return <Skeleton className="h-96" />;
  return (
    <section className="rounded-lg border bg-card p-4" data-testid="card-farm-info">
      <div className="mb-4 flex items-center justify-between gap-2"><h2 className="text-base font-bold">Farm & owner</h2>
        <Button onClick={save} disabled={!dirty} data-testid="button-save-farm"><Save />{dirty ? "Save" : "Saved"}</Button></div>
      <div className="space-y-4">
        <Section title="Owner (consignor)">
          {f("owner", "Owner name", "col-span-2", "e.g., Laura Ritter")}{f("farm", "Farm / business name", "col-span-2", "e.g., Goat Joy LLC")}
          {f("phone", "Phone")}{f("cell", "Cell phone", "", "Optional")}{f("email", "Email", "col-span-2")}
        </Section>
        <Section title="Where the goats live (origin)" sub="The physical address of the farm, not a P.O. box.">
          {f("address", "Street address", "col-span-2")}{f("city", "City")}
          <div className="grid grid-cols-2 gap-2">{f("state", "State", "", "DE")}{f("zip", "ZIP")}</div>
          {f("county", "County", "", "e.g., Sussex")}{f("mailing", "Mailing address", "", "If different")}
        </Section>
        <Section title="Official IDs and herd status" sub="From USDA / your state vet office and ADGA. Leave blank what you don't have.">
          {f("premisesId", "Premises ID (PIN)", "", "7 characters, e.g., 00AB123")}{f("flockId", "Scrapie flock ID", "", "e.g., DE1234")}
          {f("sfcp", "Scrapie program status", "col-span-2", "e.g., SFCP Export Monitored, or none")}
          <Field label="Herd health / test status" className="col-span-2" hint="e.g., CAE, CL and Johne's negative herd tests, last tested 3/2026">
            <Textarea rows={2} value={v.herdHealth ?? ""} onChange={(e) => { setV((p) => ({ ...p, herdHealth: e.target.value })); setDirty(true); }} data-testid="input-farm-herdHealth" />
          </Field>
          {f("adgaHerd", "ADGA herd name", "", "e.g., Goat Joy")}{f("herdTattoo", "Herd tattoo", "", "Right ear / tail letters")}
          {f("adgaMember", "ADGA member #", "", "Optional")}
        </Section>
        <Section title="Transport" sub="Filled in as the carrier on new travel lists.">
          {f("carrier", "Carrier", "", "e.g., Owner")}{f("vehicle", "Vehicle / trailer", "", "e.g., white F-250, stock trailer")}
        </Section>
      </div>
      {dirty && <div className="mt-4 flex justify-end"><Button onClick={save} data-testid="button-save-farm-bottom"><Save />Save</Button></div>}
    </section>
  );
}

function VetDialog({ vet, open, onOpenChange, onSave }: { vet: Vet | null; open: boolean; onOpenChange: (o: boolean) => void; onSave: (v: Vet) => Promise<void> }) {
  const [v, setV] = useState<Vet>({ id: "", name: "" }); const { toast } = useToast();
  useEffect(() => { if (open) setV(vet ?? { id: String(Date.now()), name: "" }); }, [open]); // eslint-disable-line
  const f = (k: keyof Vet, label: string, cls = "", ph = "", type = "text") => <Field label={label} className={cls}><Input type={type} value={(v[k] as string) ?? ""} placeholder={ph} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} data-testid={`input-vet-${k}`} /></Field>;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{vet ? "Edit vet" : "Add a vet"}</DialogTitle><DialogDescription>For quick calls and emails, and for sending CVI lists.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {f("name", "Vet name *", "col-span-2", "e.g., Dr. Smith")}{f("clinic", "Clinic", "col-span-2", "Optional")}
          {f("phone", "Phone", "", "", "tel")}{f("email", "Email", "", "", "email")}
          {f("address", "Street address", "col-span-2")}{f("city", "City")}
          <div className="grid grid-cols-2 gap-2">{f("state", "State")}{f("zip", "ZIP")}</div>
          {f("accreditation", "USDA accreditation #", "col-span-2", "Optional")}
          <Field label="Notes" className="col-span-2"><Textarea rows={2} value={v.notes ?? ""} onChange={(e) => setV((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional · after-hours number, what they handle" data-testid="input-vet-notes" /></Field>
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v.primary} onChange={(e) => setV((p) => ({ ...p, primary: e.target.checked }))} data-testid="check-vet-primary" />Main vet for CVIs (picked first on travel lists)</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={async () => { if (!v.name.trim()) return toast({ title: "Enter the vet's name", variant: "destructive" }); await onSave({ ...v, name: v.name.trim() }); onOpenChange(false); }} data-testid="button-save-vet">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Vets() {
  const { data, isLoading } = useVets(); const { toast } = useToast();
  const list = data?.value ?? [];
  const [edit, setEdit] = useState<Vet | null>(null); const [open, setOpen] = useState(false); const [del, setDel] = useState<Vet | null>(null);
  const upsert = async (v: Vet) => {
    let next = list.some((x) => x.id === v.id) ? list.map((x) => (x.id === v.id ? v : x)) : [...list, v];
    if (v.primary) next = next.map((x) => ({ ...x, primary: x.id === v.id }));
    if (next.length === 1) next[0].primary = true;
    await saveVets(next); toast({ title: "Vet saved", description: v.name });
  };
  const sorted = [...list].sort((a, b) => Number(!!b.primary) - Number(!!a.primary) || a.name.localeCompare(b.name));
  return (
    <section className="rounded-lg border bg-card p-4" data-testid="card-vets">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-base font-bold"><Stethoscope className="h-4 w-4 text-primary" />Vets</h2>
        <Button variant="outline" onClick={() => { setEdit(null); setOpen(true); }} data-testid="button-add-vet"><Plus />Add vet</Button></div>
      {isLoading ? <Skeleton className="h-24" /> : !sorted.length ? <Empty icon={Stethoscope} title="No vets yet">Add your vets for one-tap calls and emails.</Empty> : (
        <ul className="space-y-3">
          {sorted.map((v) => (
            <li key={v.id} className="rounded-md border p-3" data-testid={`row-vet-${v.id}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{v.name}</span>{v.primary && <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" />Main vet</Badge>}</div>
                  {v.clinic && <div className="text-sm text-muted-foreground">{v.clinic}</div>}
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {v.phone && <div>{v.phone}</div>}{v.email && <div className="break-all">{v.email}</div>}{vetAddress(v) && <div>{vetAddress(v)}</div>}
                    {v.accreditation && <div>Accreditation # {v.accreditation}</div>}{v.notes && <div className="whitespace-pre-wrap">{v.notes}</div>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Edit ${v.name}`} onClick={() => { setEdit(v); setOpen(true); }} data-testid={`button-edit-vet-${v.id}`}><Pencil /></Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${v.name}`} onClick={() => setDel(v)} data-testid={`button-delete-vet-${v.id}`}><Trash2 /></Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {v.phone && <Button asChild size="sm"><a href={tel(v.phone)} data-testid={`link-call-vet-${v.id}`}><Phone />Call</a></Button>}
                {v.phone && <Button asChild size="sm" variant="outline"><a href={`sms:${v.phone.replace(/[^\d+]/g, "")}`} data-testid={`link-text-vet-${v.id}`}>Text</a></Button>}
                {v.email && <Button asChild size="sm" variant="outline"><a href={`mailto:${v.email}`} data-testid={`link-email-vet-${v.id}`}><Mail />Email</a></Button>}
                {vetAddress(v) && <Button asChild size="sm" variant="outline"><a href={mapUrl(v)} target="_blank" rel="noreferrer" data-testid={`link-map-vet-${v.id}`}><MapPin />Directions</a></Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <VetDialog vet={edit} open={open} onOpenChange={setOpen} onSave={upsert} />
      <ConfirmDelete open={!!del} onOpenChange={(o) => !o && setDel(null)} testId="button-confirm-delete-vet" title={`Delete ${del?.name ?? "this vet"}?`} body="Travel lists that used this vet keep their saved files. This is noted in the system log."
        onConfirm={async () => { let next = list.filter((x) => x.id !== del!.id); if (next.length && !next.some((x) => x.primary)) next = next.map((x, i) => ({ ...x, primary: i === 0 })); await saveVets(next); setDel(null); toast({ title: "Vet deleted" }); }} />
    </section>
  );
}

export default function FarmPage() {
  return (
    <>
      <PageHeader title="Farm information" sub="Your farm's details for health certificates (CVIs), and your vets for quick contact." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <FarmForm />
        <Vets />
      </div>
    </>
  );
}
