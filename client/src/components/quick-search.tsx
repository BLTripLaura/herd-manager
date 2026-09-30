import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search, X, ChevronRight, MessageSquareText, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useList, matchesAnimal, idMatch, shortName, age, fmtShort, breedKey, type Animal, goatName, regName, doseText } from "@/lib/herd";
import { parseAsk, ASK_LABEL, type Ask, type AskKind } from "@/lib/ask";
import { useApp } from "@/components/shell";
import { cn } from "@/lib/utils";

/** One search box at the top of every page: type anything, jump straight to the goat */
export function QuickSearch() {
  const { data: animals = [] } = useList("animals");
  const { data: pastures = [] } = useList("pastures");
  const { setHerdQ, setReportAsk } = useApp();
  const [, nav] = useLocation();
  const [q, setQ] = useState("");
  const ask = useMemo(() => parseAsk(q), [q]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const pName = (id?: number | null) => pastures.find((p) => p.id === id)?.name ?? "";

  const results = useMemo(() => {
    const t = q.trim();
    if (!t || ask) return [];
    const single = !/\s/.test(t);
    return animals
      .map((a) => {
        const hit = (single ? idMatch(a, t)?.score ?? 0 : 0) + (matchesAnimal(a, t, pName(a.pastureId)) ? 1 : 0);
        // Barn / registered names that start with what was typed come first (so "Nova" finds Nova H4 before her kids)
        const low = t.toLowerCase(), nm = goatName(a).toLowerCase(), reg = (a.name ?? "").toLowerCase();
        const word = (x: string) => x.startsWith(low) || x.includes(" " + low);
        const name = !hit ? 0 : nm.split(/[\s\-()]+/)[0] === low ? 70 : nm.startsWith(low) ? 60 : word(nm) ? 45 : word(reg) ? 30 : 0;
        return { a, score: hit + name + (a.status === "active" ? 0.5 : 0) };
      })
      .filter((x) => x.score >= 1)
      .sort((x, y) => y.score - x.score || (x.a.tag ?? "").localeCompare(y.a.tag ?? "", undefined, { numeric: true }))
      .map((x) => x.a);
  }, [q, ask, animals, pastures]); // eslint-disable-line
  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off); return () => document.removeEventListener("mousedown", off);
  }, []);

  const shown = results.slice(0, 8);
  const go = (id: number) => { setOpen(false); setQ(""); nav(`/animal/${id}`); };
  const openReport = (a: Ask, kind?: AskKind) => { setReportAsk({ report: kind ?? (a.kind === "all" ? "treatments" : a.kind), from: a.from, to: a.to, q: a.terms.join(" ") }); setOpen(false); setQ(""); nav("/reports"); };
  const seeAll = () => { setHerdQ(q.trim()); setOpen(false); setQ(""); nav("/herd"); };

  return (
    <div ref={box} className="relative print:hidden">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, shown.length)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && ask) { openReport(ask); }
          else if (e.key === "Enter") { if (hi < shown.length && shown[hi]) go(shown[hi].id); else if (results.length) seeAll(); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search a goat, or ask: treatments 9/1 to 9/15" aria-label="Search the herd or ask a question"
        className="h-10 bg-card pl-9 pr-9" data-testid="input-quick-search" />
      {q && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setQ("")} aria-label="Clear search"><X className="h-4 w-4" /></button>}
      {open && q.trim() && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg" data-testid="quick-search-results">
          {ask ? (
            <AskAnswer ask={ask} animals={animals} onGoat={go} onReport={(k) => openReport(ask, k)} />
          ) : shown.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">No goats match “{q.trim()}”.</div>
          ) : (
            <ul>
              {shown.map((a, i) => (
                <li key={a.id}>
                  <button onMouseEnter={() => setHi(i)} onClick={() => go(a.id)} data-testid={`quick-result-${a.id}`}
                    className={cn("flex w-full items-center gap-3 px-3 py-2 text-left", hi === i && "bg-accent")}>
                    <span className="flex h-8 min-w-[2.5rem] items-center justify-center rounded-md bg-muted px-1 text-xs font-bold tabular-nums">{a.tag || "—"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{goatName(a)}{regName(a) && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{regName(a)}</span>}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <span className="capitalize">{a.sex}</span> · {age(a.dob)}{a.breed || a.color ? ` · ${[a.breed, a.color].filter(Boolean).join(", ")}` : ""}{a.status !== "active" ? ` · ${a.status}` : pName(a.pastureId) ? ` · ${pName(a.pastureId)}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!ask && results.length > 0 && (
            <button onClick={seeAll} onMouseEnter={() => setHi(shown.length)} data-testid="button-quick-see-all"
              className={cn("flex w-full items-center justify-between border-t px-3 py-2 text-sm font-medium text-primary", hi === shown.length && "bg-accent")}>
              See all {results.length} in the Herd list<ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type AskRow = { key: string; kind: AskKind; date: string; animal?: Animal; what: string; detail: string };

/** The answer to a plain-English question: every matching record in the date range, goat name and what was done */
function AskAnswer({ ask, animals, onGoat, onReport }: { ask: Ask; animals: Animal[]; onGoat: (id: number) => void; onReport: (k?: AskKind) => void }) {
  const { data: treatments = [] } = useList("treatments");
  const { data: weights = [] } = useList("weights");
  const { data: breedings = [] } = useList("breedings");
  const { data: milk = [] } = useList("milk");
  const { data: moves = [] } = useList("pastureMoves");
  const { data: heats = [] } = useList("heats");
  const { data: shows = [] } = useList("shows");
  const { data: notes = [] } = useList("animalNotes");
  const { data: care = [] } = useList("care");
  const { data: pastures = [] } = useList("pastures");

  const { rows, ignored } = useMemo(() => {
    const byId = new Map(animals.map((a) => [a.id, a]));
    const pn = (id?: number | null) => pastures.find((p) => p.id === id)?.name ?? "Unassigned";
    const want = (k: AskKind) => ask.kind === "all" || ask.kind === k;
    const all: AskRow[] = [];
    const add = (k: AskKind, id: string, date: string, animalId: number, what: string, detail: string) => all.push({ key: k + id, kind: k, date, animal: byId.get(animalId), what, detail });
    if (want("treatments")) for (const t of treatments) add("treatments", String(t.id), t.date, t.animalId, t.medName, [doseText(t), t.route, t.tempF ? `${t.tempF} °F` : "", t.doseTotal && t.doseTotal > 1 ? `dose ${t.doseNo ?? 1} of ${t.doseTotal}` : "", t.reason, t.givenBy ? `by ${t.givenBy}` : ""].filter(Boolean).join(" · "));
    if (want("weights")) for (const w of weights) add("weights", String(w.id), w.date, w.animalId, `${w.lbs} lb`, w.method ?? "");
    if (want("breedings")) for (const b of breedings) add("breedings", String(b.id), b.date, b.doeId, `Bred to ${shortName(b.buck)}`, [b.status, b.dueDate ? `due ${fmtShort(b.dueDate)}` : ""].filter(Boolean).join(" · "));
    if (want("milk")) for (const m of milk) add("milk", String(m.id), m.date, m.animalId, `${Number(m.lbs).toFixed(1)} lb milk`, [m.out1, m.out2, m.out3].filter((x) => x != null).join(" / "));
    if (want("moves")) for (const m of moves) add("moves", String(m.id), m.date, m.animalId, `Moved to ${pn(m.toPastureId)}`, `from ${pn(m.fromPastureId)}`);
    if (want("heats")) for (const h of heats) add("heats", String(h.id), h.date, h.doeId, "In heat", [h.strength, (h.signs ?? "").split(",").filter(Boolean).join(", ")].filter(Boolean).join(" · "));
    if (want("shows")) for (const x of shows) add("shows", String(x.id), x.date, x.animalId, x.showName, [x.className, x.placing].filter(Boolean).join(" · "));
    if (want("notes")) for (const n of notes) add("notes", String(n.id), n.date, n.animalId, "Note", n.note);
    if (want("care")) for (const c of care) add("care", String(c.id), c.date, c.animalId, c.kind, [c.score ? (c.kind === "FAMACHA" ? `score ${c.score}` : c.score) : "", c.notes, c.doneBy ? `by ${c.doneBy}` : ""].filter(Boolean).join(" · "));
    const inRange = all.filter((r) => (!ask.from || r.date >= ask.from) && (!ask.to || r.date <= ask.to));
    const hay = (r: AskRow) => [r.what, r.detail, r.animal?.name, r.animal?.barnName, r.animal?.tag, r.animal?.breed, breedKey(r.animal?.breed), r.animal?.color, r.animal?.groupName].filter(Boolean).join(" ").toLowerCase();
    const hays = new Map(inRange.map((r) => [r.key, hay(r)]));
    // Words that match nothing at all are treated as filler, so odd phrasing never hides real results
    const used = ask.terms.filter((t) => inRange.some((r) => hays.get(r.key)!.includes(t)));
    const ignored = ask.terms.filter((t) => !used.includes(t));
    const rows = inRange.filter((r) => used.every((t) => hays.get(r.key)!.includes(t))).sort((a, b) => a.date.localeCompare(b.date) || (a.animal?.name ?? "").localeCompare(b.animal?.name ?? ""));
    return { rows, ignored };
  }, [ask, animals, pastures, treatments, weights, breedings, milk, moves, heats, shows, notes, care]);

  const title = ask.kind === "all" ? "Everything recorded" : ASK_LABEL[ask.kind];
  const goats = new Set(rows.map((r) => r.animal?.id)).size;
  const show = rows.slice(0, 60);
  return (
    <div data-testid="ask-answer">
      <div className="flex items-start gap-2 border-b bg-accent/40 px-3 py-2">
        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold" data-testid="text-ask-summary">{title} · {ask.rangeLabel}{ask.terms.length > ignored.length ? ` · “${ask.terms.filter((t) => !ignored.includes(t)).join(" ")}”` : ""}</div>
          <div className="text-xs text-muted-foreground">
            {rows.length ? `${rows.length} record${rows.length === 1 ? "" : "s"} on ${goats} goat${goats === 1 ? "" : "s"}` : "Nothing recorded"}
            {!ask.hasDates && " · add dates to narrow it, e.g. 9/1 to 9/15"}
          </div>
        </div>
      </div>
      {rows.length > 0 && (
        <ul className="max-h-[55vh] divide-y overflow-y-auto">
          {show.map((r) => (
            <li key={r.key}>
              <button onClick={() => r.animal && onGoat(r.animal.id)} className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-accent" data-testid={`ask-row-${r.key}`}>
                <span className="w-14 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-muted-foreground">{fmtShort(r.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm"><span className="font-semibold">{r.animal ? goatName(r.animal) : "Unknown"}</span>{r.animal?.tag && <span className="text-muted-foreground"> #{r.animal.tag}</span>}<span className="text-muted-foreground"> — </span>{r.what}</span>
                  {r.detail && <span className="block truncate text-xs text-muted-foreground">{ask.kind === "all" ? `${ASK_LABEL[r.kind]} · ` : ""}{r.detail}</span>}
                </span>
              </button>
            </li>
          ))}
          {rows.length > show.length && <li className="px-3 py-2 text-xs text-muted-foreground">…and {rows.length - show.length} more. Open the report to see them all.</li>}
        </ul>
      )}
      {ask.kind !== "all" ? (
        <button onClick={() => onReport()} className="flex w-full items-center justify-between border-t px-3 py-2 text-sm font-medium text-primary hover:bg-accent" data-testid="button-ask-report">
          <span className="flex items-center gap-2"><FileText className="h-4 w-4" />Open as a report to print or export</span><ChevronRight className="h-4 w-4" />
        </button>
      ) : rows.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t px-3 py-2 text-xs">
          <span className="py-1 text-muted-foreground">Open report:</span>
          {Array.from(new Set(rows.map((r) => r.kind))).map((k) => (
            <button key={k} onClick={() => onReport(k)} className="rounded-full border px-2.5 py-1 font-medium text-primary hover:bg-accent">{ASK_LABEL[k]}</button>
          ))}
        </div>
      )}
    </div>
  );
}
