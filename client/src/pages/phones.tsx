import { useMemo, useState } from "react";
import { Plus, Phone, Pencil, Trash2, MoreHorizontal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, Empty } from "@/components/shell";
import { Field } from "@/components/forms";
import { useList, useSave, useRemove, type Contact } from "@/lib/herd";

const ROLES = ["Vet", "Vet (after hours)", "Farrier / hoof trimmer", "Feed store", "Hay", "Shearer", "Breeder", "Buyer", "Helper", "Family", "Neighbor"];

/** (302) 555-0123 for 10-digit US numbers; anything else as typed */
export function fmtPhone(p: string) {
  const d = p.replace(/\D/g, "");
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : p.trim();
}
/** tel: link that dials on a phone; keeps an extension ("x12") as a pause */
export function telHref(p: string) {
  const [main, ext] = p.split(/\s*(?:x|ext\.?)\s*/i);
  let d = main.replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(d)) d = `+1${d}`;
  return `tel:${d}${ext ? `,${ext.replace(/\D/g, "")}` : ""}`;
}

function ContactDialog({ open, onOpenChange, contact }: { open: boolean; onOpenChange: (o: boolean) => void; contact?: Contact | null }) {
  const save = useSave("contacts");
  const { toast } = useToast();
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [role, setRole] = useState("");
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) { setLastOpen(open); if (open) { setName(contact?.name ?? ""); setPhone(contact?.phone ?? ""); setRole(contact?.role ?? ""); } }
  const submit = async () => {
    if (!name.trim() || !phone.trim()) return toast({ title: "Name and number are required", variant: "destructive" });
    if (phone.replace(/\D/g, "").length < 7) return toast({ title: "That number looks too short", variant: "destructive" });
    await save.mutateAsync({ id: contact?.id, name: name.trim(), phone: fmtPhone(phone), role: role.trim() || null });
    toast({ title: contact ? "Number updated" : "Number added", description: name.trim() });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{contact ? "Edit phone number" : "Add phone number"}</DialogTitle><DialogDescription>Vet, feed store, hay, helpers and anyone else the barn needs to reach.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Smith" data-testid="input-contact-name" /></Field>
          <Field label="Number"><Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="302-555-0123" data-testid="input-contact-phone" /></Field>
          <Field label="Role" hint="Pick one or type your own">
            <Input list="contact-roles" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Vet, Feed store, Hay…" data-testid="input-contact-role" />
            <datalist id="contact-roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist>
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending} data-testid="button-save-contact">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Phones() {
  const { data: contacts, isLoading } = useList("contacts");
  const remove = useRemove("contacts");
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  const list = useMemo(() => {
    const low = q.trim().toLowerCase(); const digits = q.replace(/\D/g, "");
    return [...(contacts ?? [])]
      .filter((c) => !low || c.name.toLowerCase().includes(low) || (c.role ?? "").toLowerCase().includes(low) || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, q]);

  return (
    <div>
      <PageHeader title="Phone numbers" sub="Tap a number to call it from a phone.">
        <Button onClick={() => setAdding(true)} data-testid="button-add-contact"><Plus />Add number</Button>
      </PageHeader>

      {(contacts?.length ?? 0) > 5 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role or number" data-testid="input-contact-search" />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !contacts?.length ? (
        <Empty icon={Phone} title="No phone numbers yet">Add your vet, feed store, hay supplier and helpers so everyone at the barn can reach them.</Empty>
      ) : list.length === 0 ? (
        <Empty icon={Search} title={`Nobody matches “${q}”`} />
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3" data-testid={`row-contact-${c.id}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{c.name}</div>
                {c.role && <div className="truncate text-xs text-muted-foreground">{c.role}</div>}
                <a href={telHref(c.phone)} className="mt-0.5 inline-block text-base font-medium tabular-nums text-primary underline-offset-2 hover:underline" data-testid={`link-call-${c.id}`}>{fmtPhone(c.phone)}</a>
              </div>
              <Button asChild size="icon" variant="outline" aria-label={`Call ${c.name}`} className="h-11 w-11 shrink-0 rounded-full">
                <a href={telHref(c.phone)} data-testid={`button-call-${c.id}`}><Phone /></a>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="More" data-testid={`button-contact-menu-${c.id}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditing(c)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(c)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <ContactDialog open={adding || !!editing} onOpenChange={(o) => { if (!o) { setAdding(false); setEditing(null); } }} contact={editing} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>This takes {deleting ? fmtPhone(deleting.phone) : ""} off the phone list for everyone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { if (deleting) { await remove.mutateAsync(deleting.id); toast({ title: "Number deleted", description: deleting.name }); } setDeleting(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
