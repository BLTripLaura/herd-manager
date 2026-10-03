import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Search, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, Empty } from "@/components/shell";
import { Field } from "@/components/forms";
import { useMe } from "@/components/auth";
import { cn } from "@/lib/utils";

type Entry = { id: number; at: string; who: string | null; whoName: string | null; role: string | null; method: string; path: string; action: string; summary: string | null; data: string | null; before: string | null; status: number | null };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const person = (e: Entry) => e.whoName || (e.who ? e.who.replace(/@login\.goatjoy\.com$/, "") : "Unknown");
/** Record fields as "key: value" lines, easier to read than raw data */
function Fields({ json, compare }: { json: string; compare?: string | null }) {
  let o: any, c: any = null;
  try { o = JSON.parse(json); } catch { return <pre className="whitespace-pre-wrap break-all text-xs">{json}</pre>; }
  try { c = compare ? JSON.parse(compare) : null; } catch { /* */ }
  if (!o || typeof o !== "object") return <pre className="text-xs">{String(o)}</pre>;
  const entries = Object.entries(o).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length));
  return (
    <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-0.5 text-xs">
      {entries.map(([k, v]) => {
        const n = (x: any) => JSON.stringify(x === "" || x === undefined ? null : x);
        const changed = c && k !== "id" && n(c[k]) !== n(v);
        return [
          <dt key={k + "k"} className="text-muted-foreground">{k}</dt>,
          <dd key={k + "v"} className={cn("break-all", changed && "font-semibold text-primary")}>{typeof v === "object" ? JSON.stringify(v) : String(v)}{changed ? <span className="ml-1.5 font-normal text-muted-foreground">(was {c[k] == null || c[k] === "" ? "blank" : typeof c[k] === "object" ? JSON.stringify(c[k]) : String(c[k])})</span> : null}</dd>,
        ];
      })}
    </dl>
  );
}

export default function LogPage() {
  const me = useMe();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(200);
  const [open, setOpen] = useState<number | null>(null);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  const params = new URLSearchParams({ q, from, to, tz, limit: String(limit) }).toString();
  const { data, isLoading, isError } = useQuery<{ rows: Entry[]; total: number }>({
    queryKey: ["/api/audit", params],
    queryFn: async () => { const r = await fetch(`/api/audit?${params}`); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? "Could not load"); return r.json(); },
    enabled: me?.role === "owner",
  });
  if (me?.role !== "owner") return <><PageHeader title="System log" /><Empty icon={ScrollText} title="Only the owner can see the system log" /></>;
  const rows = data?.rows ?? [];
  let lastDay = "";
  return (
    <>
      <PageHeader title="System log" sub="Every change made in the app: when, who, and what. Entries can't be changed or deleted." />
      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_auto_auto]">
        <Field label="Search"><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Goat, medicine, person, “deleted”…" data-testid="input-log-search" /></div></Field>
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-log-from" /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-log-to" /></Field>
      </div>
      {isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        : isError ? <Empty icon={ScrollText} title="Could not load the log">Try again in a moment.</Empty>
        : rows.length === 0 ? <Empty icon={ScrollText} title={q || from || to ? "Nothing matches" : "No changes logged yet"}>{q || from || to ? "Try a different search or dates." : "Changes show up here as soon as anyone saves something."}</Empty>
        : (
          <>
            <p className="mb-2 text-xs text-muted-foreground" data-testid="text-log-count">{data!.total} entr{data!.total === 1 ? "y" : "ies"}{data!.total > rows.length ? `, showing the newest ${rows.length}` : ""}</p>
            <ul className="overflow-hidden rounded-lg border bg-card">
              {rows.map((e) => {
                const d = day(e.at); const head = d !== lastDay; lastDay = d;
                const failed = e.status != null && e.status >= 400;
                const del = /^Deleted/.test(e.action);
                return [
                  head && <li key={`d${e.id}`} className="border-b bg-muted/50 px-4 py-1.5 text-xs font-semibold text-muted-foreground">{d}</li>,
                  <li key={e.id} className="border-b last:border-b-0" data-testid={`row-log-${e.id}`}>
                    <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover-elevate">
                      <span className="w-20 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("text-sm font-semibold", del && "text-destructive")}>{e.action}</span>
                        {failed && <span className="ml-1.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">didn't go through</span>}
                        {e.summary && <span className="block truncate text-xs text-muted-foreground">{e.summary}</span>}
                      </span>
                      <span className="shrink-0 text-right text-xs"><span className="font-medium">{person(e)}</span>{e.role && <span className="block text-muted-foreground">{e.role === "owner" ? "owner" : "helper"}</span>}</span>
                      <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open === e.id && "rotate-180")} />
                    </button>
                    {open === e.id && (
                      <div className="space-y-3 border-t bg-muted/30 px-4 py-3" data-testid={`detail-log-${e.id}`}>
                        <p className="text-xs text-muted-foreground">{when(e.at)} · {e.who ?? "unknown"} · {e.method} {e.path}{e.status ? ` · result ${e.status}` : ""}</p>
                        {e.before && <div><div className="mb-1 text-xs font-semibold">{del ? "What was deleted" : "Before the change"}</div><Fields json={e.before} /></div>}
                        {e.data && <div><div className="mb-1 text-xs font-semibold">{e.before ? "Changed to" : "What was saved"}</div><Fields json={e.data} compare={e.before} /></div>}
                        {!e.before && !e.data && <p className="text-xs text-muted-foreground">No details for this entry.</p>}
                      </div>
                    )}
                  </li>,
                ];
              })}
            </ul>
            {data!.total > rows.length && <div className="mt-3 text-center"><Button variant="outline" onClick={() => setLimit(limit + 200)} data-testid="button-log-more">Show older entries</Button></div>}
          </>
        )}
    </>
  );
}
