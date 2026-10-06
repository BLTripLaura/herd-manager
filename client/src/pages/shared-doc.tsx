import { useEffect, useState } from "react";
import { Loader2, Printer, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shell";
import { useFarmName } from "@/lib/farm";
import { loadDoc, printDoc, isImage, isPdf, fmtSize } from "@/lib/docs";

/** What someone sees when they open a link the farm texted or emailed (no sign-in) */
export default function SharedDoc({ token }: { token: string }) {
  const farm = useFarmName();
  const [meta, setMeta] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [pct, setPct] = useState(0);
  useEffect(() => {
    let u = "";
    (async () => {
      const r = await fetch(`/api/public/doc/${encodeURIComponent(token)}`);
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).message ?? "This link has expired."); return; }
      const m = await r.json(); setMeta(m); document.title = m.title;
      const f = await loadDoc(m, `/api/public/doc/${encodeURIComponent(token)}`, setPct);
      u = URL.createObjectURL(f); setFile(f); setUrl(u);
    })().catch((e) => setErr(String(e?.message ?? e)));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [token]);
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-3"><Logo className="h-9 w-9" /><div className="text-sm font-semibold">{farm || "Herd Manager"}</div></header>
      <main className="mx-auto max-w-4xl p-4">
        {err ? <div className="mt-16 text-center"><FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-semibold">{err}</p><p className="mt-1 text-sm text-muted-foreground">Ask the farm to send a new link.</p></div> : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h1 className="text-xl font-bold" data-testid="text-shared-title">{meta?.title ?? "Opening…"}</h1>{meta && <p className="text-xs text-muted-foreground">{meta.fileName} · {fmtSize(meta.size)} · link works until {new Date(meta.expiresAt).toLocaleDateString()}</p>}</div>
              <div className="flex gap-2">
                <Button onClick={() => file && printDoc(file, url, meta.title)} disabled={!file} data-testid="button-shared-print"><Printer />Print</Button>
                <Button variant="outline" onClick={() => { if (!file) return; const a = document.createElement("a"); a.href = url; a.download = meta.fileName; a.click(); }} disabled={!file} data-testid="button-shared-download"><Download />Download</Button>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border bg-muted/30">
              {!file ? <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />Opening… {Math.round(pct * 100)}%</div>
                : isImage(file.type, file.name) ? <img src={url} alt={meta.title} className="mx-auto max-h-[80dvh]" />
                : isPdf(file.type, file.name) ? <iframe src={url} title={meta.title} className="h-[80dvh] w-full bg-white" />
                : <p className="p-8 text-center text-sm text-muted-foreground">Use Download to open {meta.fileName}.</p>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
