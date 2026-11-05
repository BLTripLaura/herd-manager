import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DatabaseBackup, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { post, API_BASE, fmtDate } from "@/lib/herd";

type Backup = { name: string; date: string; kind?: "daily" | "weekly" | "monthly"; bytes: number; savedAt: string };
const KIND: Record<string, string> = { weekly: "Weekly", monthly: "Monthly" };
const daysAgo = (iso?: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

/** Automatic copies (nightly for 30 days, Sundays for 12 weeks, monthly for a year) and the one-file Excel backup */
export function BackupsCard() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const { data, refetch } = useQuery<{ backups: Backup[]; lastSaved?: string | null; lastAuto?: string | null }>({ queryKey: ["/api/backups"] });
  const saved = daysAgo(data?.lastSaved), auto = daysAgo(data?.lastAuto);
  const list = data?.backups ?? [];
  const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;
  return (
    <div className="rounded-lg border bg-card p-4" data-testid="card-backups">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold"><DatabaseBackup className="h-4 w-4 text-primary" />Automatic backups</h2>
      <p className="mb-2 text-sm text-muted-foreground">A full copy of the herd is saved automatically every night around 2:00 AM. The app keeps every nightly copy for 30 days, the Sunday copy for 12 weeks, and the first copy of each month for a year. Each one downloads as an Excel file.</p>
      <p className="mb-3 text-sm text-muted-foreground" data-testid="text-offsite-status">These copies live inside the app's database, so also keep one somewhere else: download the Excel backup at least once a month to your computer, Google Drive or OneDrive.{" "}
        {saved == null ? <b>No Excel copy has been downloaded yet.</b> : <span>Last downloaded {saved === 0 ? "today" : `${saved} day${saved === 1 ? "" : "s"} ago`}.</span>}
        {auto != null && <span> Weekly emailed copy last sent {auto === 0 ? "today" : `${auto} day${auto === 1 ? "" : "s"} ago`}.</span>}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm"><a href={`${API_BASE}/api/backups/excel`} onClick={() => setTimeout(() => refetch(), 4000)} target="_blank" rel="noopener noreferrer" data-testid="link-backup-excel"><FileSpreadsheet />Download Excel backup</a></Button>
        <Button variant="outline" size="sm" disabled={busy} data-testid="button-backup-now"
          onClick={async () => { setBusy(true); try { await post("/api/backups/run"); await refetch(); toast({ title: "Backup saved" }); } finally { setBusy(false); } }}>
          <DatabaseBackup />Back up now
        </Button>
      </div>
      {list.length === 0 ? <p className="text-xs text-muted-foreground">The first nightly copy will appear here after 2:00 AM.</p> : (
        <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
          {list.map((b) => (
            <li key={b.name} className="flex items-center justify-between gap-3 px-3 py-2" data-testid={`row-backup-${b.date}`}>
              <span>{fmtDate(b.date)}{b.kind && KIND[b.kind] ? <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">{KIND[b.kind]}</span> : null} <span className="text-xs text-muted-foreground">· {new Date(b.savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} · {mb(b.bytes)}</span></span>
              <a className="inline-flex items-center gap-1 text-xs font-medium text-primary" href={`${API_BASE}/api/backups/file/${b.date}`} target="_blank" rel="noopener noreferrer"><Download className="h-3.5 w-3.5" />Excel</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
