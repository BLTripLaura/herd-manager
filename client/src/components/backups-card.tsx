import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DatabaseBackup, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { post, API_BASE, fmtDate } from "@/lib/herd";

type Backup = { name: string; date: string; bytes: number; savedAt: string };

/** Nightly copies (2:00 AM Eastern, last 30 kept) and the one-file Excel backup */
export function BackupsCard() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const { data, refetch } = useQuery<{ backups: Backup[] }>({ queryKey: ["/api/backups"] });
  const list = data?.backups ?? [];
  const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;
  return (
    <div className="rounded-lg border bg-card p-4" data-testid="card-backups">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold"><DatabaseBackup className="h-4 w-4 text-primary" />Automatic backups</h2>
      <p className="mb-3 text-sm text-muted-foreground">A full copy of the herd is saved every night around 2:00 AM, and the last 30 are kept. Each one downloads as an Excel file. An Excel copy is also emailed to you on Sundays.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm"><a href={`${API_BASE}/api/backups/excel`} target="_blank" rel="noopener noreferrer" data-testid="link-backup-excel"><FileSpreadsheet />Download Excel backup</a></Button>
        <Button variant="outline" size="sm" disabled={busy} data-testid="button-backup-now"
          onClick={async () => { setBusy(true); try { await post("/api/backups/run"); await refetch(); toast({ title: "Backup saved" }); } finally { setBusy(false); } }}>
          <DatabaseBackup />Back up now
        </Button>
      </div>
      {list.length === 0 ? <p className="text-xs text-muted-foreground">The first nightly copy will appear here after 2:00 AM.</p> : (
        <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
          {list.map((b) => (
            <li key={b.name} className="flex items-center justify-between gap-3 px-3 py-2" data-testid={`row-backup-${b.date}`}>
              <span>{fmtDate(b.date)} <span className="text-xs text-muted-foreground">· {new Date(b.savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} · {mb(b.bytes)}</span></span>
              <a className="inline-flex items-center gap-1 text-xs font-medium text-primary" href={`${API_BASE}/api/backups/file/${b.date}`} target="_blank" rel="noopener noreferrer"><Download className="h-3.5 w-3.5" />Excel</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
