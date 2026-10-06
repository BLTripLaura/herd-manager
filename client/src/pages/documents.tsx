import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, FileImage, File as FileIcon, Plus, Search, Printer, Send, Pencil, Trash2, Loader2, Maximize2, MessageSquare, Mail, Link2, Share, FolderOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, Empty } from "@/components/shell";
import { Field, Pick } from "@/components/forms";
import { ConfirmDelete } from "@/components/confirm-delete";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useList, today, fmtDate, goatName, type Animal } from "@/lib/herd";
import { CABINET_LABEL, FOLDERS, MAX_MB, uploadDoc, loadDoc, printDoc, shareLink, canShareFile, isImage, isPdf, fmtSize, type Cabinet, type Doc } from "@/lib/docs";
import { cn } from "@/lib/utils";
import { useFarmName } from "@/lib/farm";

const useDocs = (cabinet: Cabinet) => useQuery<Doc[]>({ queryKey: ["/api/documents", cabinet], queryFn: async () => (await apiRequest("GET", `/api/documents?cabinet=${cabinet}`)).json() });
const goatLabel = (a: Animal) => goatName(a) + (a.status !== "active" ? ` (${a.status})` : "");

function DocIcon({ d, className }: { d: Pick<Doc, "mime" | "fileName" | "thumb">; className?: string }) {
  if (d.thumb) return <img src={d.thumb} alt="" className={cn("rounded object-cover", className)} />;
  const I = isImage(d.mime, d.fileName) ? FileImage : isPdf(d.mime, d.fileName) ? FileText : FileIcon;
  return <div className={cn("flex items-center justify-center rounded bg-primary/10 text-primary", className)}><I className="h-6 w-6" /></div>;
}

/** Goat picker: type a name, pick from the list (optional) */
function GoatField({ value, onChange, animals }: { value: number | null; onChange: (id: number | null) => void; animals: Animal[] }) {
  const sorted = useMemo(() => [...animals].sort((a, b) => goatLabel(a).localeCompare(goatLabel(b))), [animals]);
  const cur = animals.find((a) => a.id === value);
  const [txt, setTxt] = useState(cur ? goatLabel(cur) : "");
  useEffect(() => { setTxt(cur ? goatLabel(cur) : ""); }, [value]); // eslint-disable-line
  return (
    <>
      <Input list="doc-goats" value={txt} placeholder="Optional · type a name" data-testid="input-doc-goat"
        onChange={(e) => { setTxt(e.target.value); const m = sorted.find((a) => goatLabel(a) === e.target.value); onChange(m ? m.id : null); }} />
      <datalist id="doc-goats">{sorted.map((a) => <option key={a.id} value={goatLabel(a)} />)}</datalist>
    </>
  );
}

function DetailsFields({ v, set, cabinet, folders, animals }: { v: any; set: (k: string) => (x: any) => void; cabinet: Cabinet; folders: string[]; animals: Animal[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Name" className="col-span-2"><Input value={v.title ?? ""} onChange={(e) => set("title")(e.target.value)} placeholder={cabinet === "sale" ? "e.g., Bill of sale – Aioli" : "e.g., CD&T label"} data-testid="input-doc-title" /></Field>
      <Field label="Folder" className="col-span-2" hint="Pick one or type a new folder">
        <Input list="doc-folders" value={v.folder ?? ""} onChange={(e) => set("folder")(e.target.value)} placeholder="Optional" data-testid="input-doc-folder" />
        <datalist id="doc-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
      </Field>
      <Field label="Date"><Input type="date" value={v.docDate ?? ""} onChange={(e) => set("docDate")(e.target.value)} data-testid="input-doc-date" /></Field>
      <Field label="Goat"><GoatField value={v.animalId ?? null} onChange={set("animalId")} animals={animals} /></Field>
      <Field label="Notes" className="col-span-2"><Textarea rows={2} value={v.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} placeholder="Optional" data-testid="input-doc-notes" /></Field>
    </div>
  );
}

function AddDialog({ open, onOpenChange, cabinet, folders, animals, defaultFolder }: { open: boolean; onOpenChange: (o: boolean) => void; cabinet: Cabinet; folders: string[]; animals: Animal[]; defaultFolder?: string | null }) {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [v, setV] = useState<any>({});
  const [busy, setBusy] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setFiles([]); setV({ docDate: today(), folder: defaultFolder ?? "" }); setBusy(null); } }, [open]); // eslint-disable-line
  const set = (k: string) => (x: any) => setV((p: any) => ({ ...p, [k]: x }));
  const pick = (list: FileList | null) => {
    const fs = Array.from(list ?? []); if (!fs.length) return;
    const big = fs.find((f) => f.size > MAX_MB * 1024 * 1024 && !isImage(f.type, f.name));
    if (big) return toast({ title: `${big.name} is over ${MAX_MB} MB`, variant: "destructive" });
    setFiles(fs); if (!v.title && fs.length === 1) set("title")(fs[0].name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  };
  const save = async () => {
    if (!files.length) return toast({ title: "Choose a file first", variant: "destructive" });
    if (files.length === 1 && !String(v.title ?? "").trim()) return toast({ title: "Give the document a name", variant: "destructive" });
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const title = files.length === 1 ? String(v.title).trim() : (String(v.title ?? "").trim() ? `${String(v.title).trim()} (${i + 1})` : f.name.replace(/\.[^.]+$/, ""));
        await uploadDoc(f, { cabinet, title, folder: v.folder || null, animalId: v.animalId ?? null, docDate: v.docDate || null, notes: v.notes || null }, (p) => setBusy((i + p) / files.length));
      }
      toast({ title: files.length === 1 ? "Saved to the cabinet" : `${files.length} documents saved`, description: CABINET_LABEL[cabinet] });
      onOpenChange(false);
    } catch (e: any) { toast({ title: "Could not save", description: String(e?.message ?? e), variant: "destructive" }); }
    finally { setBusy(null); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => busy === null && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add to {CABINET_LABEL[cabinet]}</DialogTitle><DialogDescription>PDF, photo or scan, Word or Excel, up to {MAX_MB} MB.</DialogDescription></DialogHeader>
        <input ref={ref} type="file" multiple className="hidden" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.csv" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} data-testid="input-doc-file" />
        <button type="button" onClick={() => ref.current?.click()} className="flex w-full items-center gap-3 rounded-lg border border-dashed p-4 text-left hover:border-primary" data-testid="button-pick-file">
          <FolderOpen className="h-6 w-6 shrink-0 text-primary" />
          <span className="min-w-0 text-sm">{files.length ? <><span className="block truncate font-semibold">{files.length === 1 ? files[0].name : `${files.length} files`}</span><span className="text-xs text-muted-foreground">{fmtSize(files.reduce((s, f) => s + f.size, 0))} · tap to change</span></> : <><span className="block font-semibold">Choose a file or take a photo</span><span className="text-xs text-muted-foreground">On the iPad you can pick from Files or Photos, or use the camera</span></>}</span>
        </button>
        <DetailsFields v={v} set={set} cabinet={cabinet} folders={folders} animals={animals} />
        {busy !== null && <div className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(busy * 100)}%` }} /></div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy !== null}>Cancel</Button>
          <Button onClick={save} disabled={busy !== null} data-testid="button-save-doc">{busy !== null ? `Saving… ${Math.round(busy * 100)}%` : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendDialog({ doc, file, open, onOpenChange }: { doc: Doc; file: File | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const farm = useFarmName();
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setLink(null); }, [open]);
  const getLink = async () => { if (link) return link; setBusy(true); try { const l = await shareLink(doc.id); setLink(l); return l; } finally { setBusy(false); } };
  const msg = (url: string) => `${doc.title} from ${farm || "the farm"}: ${url}`;
  const viaText = async () => { const l = await getLink(); window.location.href = `sms:&body=${encodeURIComponent(msg(l.url))}`; };
  const viaEmail = async () => { const l = await getLink(); window.location.href = `mailto:?subject=${encodeURIComponent(`${doc.title}${farm ? ` – ${farm}` : ""}`)}&body=${encodeURIComponent(`Here is ${doc.title}:\n\n${l.url}\n\nThe link works for 7 days.`)}`; };
  const copy = async () => { const l = await getLink(); try { await navigator.clipboard.writeText(l.url); toast({ title: "Link copied", description: "Paste it into a text or email. It works for 7 days." }); } catch { toast({ title: "Here's the link", description: l.url }); } };
  const shareFile = async () => { try { await navigator.share({ files: [file!], title: doc.title }); } catch (e: any) { if (e?.name !== "AbortError") toast({ title: "Could not open sharing", description: String(e?.message ?? e), variant: "destructive" }); } };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Send “{doc.title}”</DialogTitle><DialogDescription>Send the file itself, or a link that opens it for 7 days without signing in.</DialogDescription></DialogHeader>
        <div className="grid gap-2">
          {canShareFile(file) && <Button className="justify-start" onClick={shareFile} data-testid="button-share-file"><Share />Send the file (Messages, Mail, AirDrop…)</Button>}
          <Button variant="outline" className="justify-start" onClick={viaText} disabled={busy} data-testid="button-send-text"><MessageSquare />Text a link</Button>
          <Button variant="outline" className="justify-start" onClick={viaEmail} disabled={busy} data-testid="button-send-email"><Mail />Email a link</Button>
          <Button variant="outline" className="justify-start" onClick={copy} disabled={busy} data-testid="button-copy-link"><Link2 />Copy link</Button>
          {link && <p className="break-all rounded bg-muted p-2 text-xs" data-testid="text-share-link">{link.url}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ViewDialog({ doc, onClose, cabinet, folders, animals }: { doc: Doc | null; onClose: () => void; cabinet: Cabinet; folders: string[]; animals: Animal[] }) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<null | "edit" | "send" | "delete">(null);
  const [v, setV] = useState<any>({});
  useEffect(() => {
    if (!doc) return;
    let u = ""; let live = true; setFile(null); setUrl(""); setErr(""); setPct(0); setMode(null);
    loadDoc(doc, undefined, (p) => live && setPct(p)).then((f) => { if (!live) return; u = URL.createObjectURL(f); setFile(f); setUrl(u); }).catch((e) => live && setErr(String(e?.message ?? e)));
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [doc?.id]); // eslint-disable-line
  if (!doc) return null;
  const goat = animals.find((a) => a.id === doc.animalId);
  const set = (k: string) => (x: any) => setV((p: any) => ({ ...p, [k]: x }));
  const print = async () => { if (!file) return; try { const r = await printDoc(file, url, doc.title); if (r === "opened") toast({ title: "Opened full screen", description: "Use the share button there and choose Print." }); if (r === "downloaded") toast({ title: "Downloaded", description: "Open the file and print it from there." }); } catch (e: any) { if (e?.name !== "AbortError") toast({ title: "Could not print", description: String(e?.message ?? e), variant: "destructive" }); } };
  const saveEdit = async () => {
    if (!String(v.title ?? "").trim()) return toast({ title: "Give the document a name", variant: "destructive" });
    await apiRequest("PATCH", `/api/documents/${doc.id}`, { title: v.title, folder: v.folder || null, docDate: v.docDate || null, notes: v.notes || null, animalId: v.animalId ?? null, cabinet: v.cabinet });
    queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    toast({ title: "Saved", description: v.cabinet !== cabinet ? `Moved to ${CABINET_LABEL[v.cabinet as Cabinet]}` : undefined });
    setMode(null); if (v.cabinet !== cabinet) onClose();
  };
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{doc.title}</DialogTitle>
          <DialogDescription>{[doc.folder, doc.docDate ? fmtDate(doc.docDate) : null, goat ? goatName(goat) : null, fmtSize(doc.size)].filter(Boolean).join(" · ")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button onClick={print} disabled={!file} data-testid="button-print-doc"><Printer />Print</Button>
          <Button variant="outline" onClick={() => setMode("send")} disabled={!file} data-testid="button-send-doc"><Send />Send</Button>
          <Button variant="outline" onClick={() => url && window.open(url, "_blank")} disabled={!file} data-testid="button-open-doc"><Maximize2 />Full screen</Button>
          <Button variant="outline" onClick={() => { if (!file) return; const a = document.createElement("a"); a.href = url; a.download = doc.fileName; a.click(); }} disabled={!file} data-testid="button-download-doc"><Download />Download</Button>
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="icon" aria-label="Edit details" onClick={() => { setV({ ...doc }); setMode("edit"); }} data-testid="button-edit-doc"><Pencil /></Button>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label="Delete document" onClick={() => setMode("delete")} data-testid="button-delete-doc"><Trash2 /></Button>
          </div>
        </div>
        {doc.notes && <p className="whitespace-pre-wrap rounded bg-muted/50 p-3 text-sm">{doc.notes}</p>}
        <div className="overflow-hidden rounded-lg border bg-muted/30" data-testid="doc-preview">
          {err ? <p className="p-6 text-center text-sm text-destructive">{err}</p>
            : !file ? <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />Opening… {Math.round(pct * 100)}%</div>
            : isImage(file.type, file.name) ? <img src={url} alt={doc.title} className="mx-auto max-h-[65dvh] w-auto" />
            : isPdf(file.type, file.name) ? <iframe src={url} title={doc.title} className="h-[65dvh] w-full bg-white" />
            : <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><FileIcon className="h-8 w-8" />{doc.fileName}<span>No preview for this kind of file. Use Full screen or Download to open it.</span></div>}
        </div>
        <Dialog open={mode === "edit"} onOpenChange={(o) => !o && setMode(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Edit details</DialogTitle><DialogDescription>{doc.fileName}</DialogDescription></DialogHeader>
            <DetailsFields v={v} set={set} cabinet={cabinet} folders={folders} animals={animals} />
            <Field label="Cabinet"><Pick value={v.cabinet} onChange={set("cabinet")} options={[{ value: "reference", label: CABINET_LABEL.reference }, { value: "sale", label: CABINET_LABEL.sale }]} testId="select-doc-cabinet" /></Field>
            <DialogFooter><Button variant="outline" onClick={() => setMode(null)}>Cancel</Button><Button onClick={saveEdit} data-testid="button-save-doc-edit">Save changes</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <SendDialog doc={doc} file={file} open={mode === "send"} onOpenChange={(o) => setMode(o ? "send" : null)} />
        <ConfirmDelete open={mode === "delete"} onOpenChange={(o) => !o && setMode(null)} testId="button-confirm-delete-doc"
          title={`Delete “${doc.title}”?`} body="It comes out of the cabinet for good, and any links you sent stop working. This can't be undone and is noted in the system log."
          onConfirm={async () => { await apiRequest("DELETE", `/api/documents/${doc.id}`); queryClient.invalidateQueries({ queryKey: ["/api/documents"] }); toast({ title: "Deleted", description: doc.title }); onClose(); }} />
      </DialogContent>
    </Dialog>
  );
}

export function DocumentsPage({ cabinet }: { cabinet: Cabinet }) {
  const { data: docs, isLoading } = useDocs(cabinet);
  const { data: animals = [] } = useList("animals");
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Doc | null>(null);
  useEffect(() => { setFolder(null); setQ(""); setOpen(null); }, [cabinet]);
  const list = docs ?? [];
  const folders = useMemo(() => Array.from(new Set([...list.map((d) => d.folder).filter(Boolean) as string[], ...FOLDERS[cabinet]])), [list, cabinet]);
  const used = useMemo(() => Array.from(new Set(list.map((d) => d.folder || "Not filed"))).sort(), [list]);
  const shown = list.filter((d) => {
    if (folder && (d.folder || "Not filed") !== folder) return false;
    if (!q.trim()) return true;
    const g = animals.find((a) => a.id === d.animalId);
    return [d.title, d.folder, d.notes, d.fileName, g ? goatName(g) : "", g?.name].join(" ").toLowerCase().includes(q.trim().toLowerCase());
  });
  return (
    <>
      <PageHeader title={CABINET_LABEL[cabinet]} sub={cabinet === "sale" ? "Bills of sale, health certificates, transfers and receipts, ready to print or send." : "Labels, protocols, manuals and other papers to look up quickly, print or send."}>
        <Button onClick={() => setAdding(true)} data-testid="button-add-doc"><Plus />Add document</Button>
      </PageHeader>
      <div className="mb-3 relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, folders, goats, notes" data-testid="input-doc-search" /></div>
      {used.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5" data-testid="doc-folders">
          <button type="button" onClick={() => setFolder(null)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", !folder ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary")}>All ({list.length})</button>
          {used.map((f) => <button key={f} type="button" onClick={() => setFolder(folder === f ? null : f)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", folder === f ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary")} data-testid={`chip-folder-${f}`}>{f} ({list.filter((d) => (d.folder || "Not filed") === f).length})</button>)}
        </div>
      )}
      {isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        : shown.length === 0 ? <Empty icon={FolderOpen} title={list.length ? "Nothing matches" : "The cabinet is empty"}>{list.length ? "Try another search or folder." : "Use Add document to file a PDF, photo or scan."}</Empty>
        : (
          <ul className="overflow-hidden rounded-lg border bg-card">
            {shown.map((d) => { const g = animals.find((a) => a.id === d.animalId); return (
              <li key={d.id} className="border-b last:border-b-0">
                <button type="button" onClick={() => setOpen(d)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover-elevate" data-testid={`row-doc-${d.id}`}>
                  <DocIcon d={d} className="h-12 w-12 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{d.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[d.folder, d.docDate ? fmtDate(d.docDate) : null, g ? goatName(g) : null, fmtSize(d.size)].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ); })}
          </ul>
        )}
      <AddDialog open={adding} onOpenChange={setAdding} cabinet={cabinet} folders={folders} animals={animals} defaultFolder={folder && folder !== "Not filed" ? folder : null} />
      <ViewDialog doc={open} onClose={() => setOpen(null)} cabinet={cabinet} folders={folders} animals={animals} />
    </>
  );
}
export const ReferenceDocs = () => <DocumentsPage cabinet="reference" />;
export const SaleDocs = () => <DocumentsPage cabinet="sale" />;
