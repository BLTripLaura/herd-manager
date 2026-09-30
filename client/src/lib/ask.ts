/* Plain-English questions for search: "what treatments were done 9/1 to 9/15", "who was bred in August",
   "CD&T shots last month", "weights since June 1". Pulls out the record type and date range; the words
   that are left become ordinary search terms (goat names, medicine, reason…). */
import { addDays, toISO, today as todayISO, fmtDate } from "@/lib/herd";

export type AskKind = "treatments" | "weights" | "breedings" | "milk" | "moves" | "heats" | "shows" | "notes" | "care";
export const ASK_LABEL: Record<AskKind, string> = {
  treatments: "Treatments", weights: "Weights", breedings: "Breedings", milk: "Milk tests", moves: "Pasture moves", heats: "Heats", shows: "Shows", notes: "Animal notes", care: "Care jobs",
};
export type Ask = { kind: AskKind | "all"; from: string; to: string; terms: string[]; rangeLabel: string; hasDates: boolean };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const monIdx = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase());
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const valid = (y: number, m: number, d: number) => m >= 0 && m < 12 && d >= 1 && d <= new Date(y, m + 1, 0).getDate();
const fullYear = (y: string) => (y.length <= 2 ? 2000 + Number(y) : Number(y));
const endOfMonth = (y: number, m: number) => iso(y, m, new Date(y, m + 1, 0).getDate());

// Record-type words. Order matters: more specific first.
const KINDS: [AskKind, RegExp][] = [
  ["care", /\bhoo(?:f|ves)\b|\btrim(?:s|med|ming)?\b|\bfamacha\b|\bbody\s+condition\b|\bbcs\b|\bclipp?(?:ed|ing)?\b|\bshav(?:e|ed|ing)\b|\bdisbud\w*\b|\btattoo(?:s|ed)?\b|\bfecals?\b|\bblood\s+(?:draws?|tests?)\b|\bcare(?:\s+jobs?)?\b|\bchores?\b|\bbath(?:s|ed)?\b|\bwean(?:ed|ing)?\b|\bband(?:ed|ing)\b|\bcastrat\w*\b|\budder\s+checks?\b/],
  ["milk", /\bmilk(?:ing)?\s+(?:tests?|records?|weights?)\b|\btest[- ]?days?\b|\bmilk(?:ed)?\b/],
  ["weights", /\bweigh(?:ts?|ed|ing|s)?\b/],
  ["breedings", /\bbre(?:d|eding|edings)\b|\bkidd(?:ing|ed)\b|\bultrasound(?:s|ed)?\b|\bdue\s+dates?\b|\bpregnan\w*\b|\bservice[ds]?\b/],
  ["heats", /\b(?:in\s+)?heats?\b|\bcycl(?:e|ed|ing)\b/],
  ["moves", /\bmov(?:e|es|ed|ing)\b|\bpasture\s+moves?\b|\brotat\w*\b/],
  ["shows", /\bshows\b|\bshowed\b|\bshown\b|\bplac(?:ed|ing|ings)\b|\bjudg\w*\b|\bribbons?\b/],
  ["notes", /\bnotes?\b/],
  ["treatments", /\btreat(?:ment|ments|ed|ing)?\b|\bmed(?:s|ication|ications|icine|icines|icated)?\b|\bshots?\b|\bvaccin\w*\b|\bboosters?\b|\binject\w*\b|\bdos(?:e|es|ed|ing)\b|\b(?:de)?worm(?:ed|er|ing)?\b|\bdrench\w*\b|\bantibiotics?\b|\bgiven\b|\bgave\b/],
];

// Words that carry no meaning for the search once type and dates are known
const STOP = new Set(("what which who whom whose were was is are be been being done do did does has have had get got gets receive received receiving " +
  "list show me all any every the a an of on in at to from for between and through thru until till til since after before during by " +
  "this that these those date dates day days period range time times give goat goats animal animals herd our we us i my please " +
  "how many much tell find see there any anything something records record entries entry happened with").split(" "));

type Span = { start: number; end: number; from: string; to: string; single?: boolean; label?: string; op?: "since" | "before" };

/** Find every date expression in the text, in order */
function findDates(text: string, now: string): Span[] {
  const spans: Span[] = [];
  const [ty, tm] = now.split("-").map(Number);
  const take = (re: RegExp, fn: (m: RegExpExecArray) => Omit<Span, "start" | "end"> | null) => {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      const s = m.index, e = s + m[0].length;
      if (spans.some((x) => s < x.end && e > x.start)) continue;
      const r = fn(m); if (r) spans.push({ start: s, end: e, ...r });
    }
  };
  // Guess the year for a date typed without one: this year, or last year if that would be in the future
  const guessYear = (m: number, d: number) => (iso(ty, m, d) > addDays(now, 1) ? ty - 1 : ty);
  const day = (y: number | null, m: number, d: number) => { const yy = y ?? guessYear(m, d); return valid(yy, m, d) ? iso(yy, m, d) : null; };
  const one = (v: string | null) => (v ? { from: v, to: v, single: true } : null);

  // Relative phrases
  take(/\b(?:the\s+)?(?:last|past|previous)\s+(\d{1,3})\s+(days?|weeks?|months?)\b/g, (m) => {
    const n = Number(m[1]); const u = m[2][0];
    const from = u === "d" ? addDays(now, -n + 1) : u === "w" ? addDays(now, -7 * n + 1) : (() => { const d = new Date(now + "T12:00:00"); d.setMonth(d.getMonth() - n); return toISO(d); })();
    return { from, to: now, label: `last ${n} ${m[2]}` };
  });
  take(/\btoday\b/g, () => ({ from: now, to: now, single: true, label: "today" }));
  take(/\byesterday\b/g, () => { const y = addDays(now, -1); return { from: y, to: y, single: true, label: "yesterday" }; });
  take(/\b(this|last)\s+week\b/g, (m) => {
    const dow = new Date(now + "T12:00:00").getDay(); const sun = addDays(now, -dow);
    return m[1] === "this" ? { from: sun, to: now, label: "this week" } : { from: addDays(sun, -7), to: addDays(sun, -1), label: "last week" };
  });
  take(/\b(this|last)\s+month\b/g, (m) => {
    let y = ty, mo = tm - 1; if (m[1] === "last") { mo -= 1; if (mo < 0) { mo = 11; y -= 1; } }
    return { from: iso(y, mo, 1), to: m[1] === "this" ? now : endOfMonth(y, mo), label: `${m[1]} month` };
  });
  take(/\b(this|last)\s+year\b/g, (m) => { const y = m[1] === "this" ? ty : ty - 1; return { from: `${y}-01-01`, to: m[1] === "this" ? now : `${y}-12-31`, label: `${m[1]} year` }; });

  // 2026-09-01
  take(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (m) => one(day(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
  // 9/1, 9/1/26, 9-1-2026, 9.1.2026
  take(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?\b/g, (m) => one(day(m[3] ? fullYear(m[3]) : null, Number(m[1]) - 1, Number(m[2]))));
  // Sep 1, September 1st, Sept 1 2026, Sep 1, 2026
  take(new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi"), (m) => one(day(m[3] ? Number(m[3]) : null, monIdx(m[1]), Number(m[2]))));
  // 1 Sep, 1st of September 2026
  take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}(?:,?\\s+(\\d{4}))?\\b`, "gi"), (m) => one(day(m[3] ? Number(m[3]) : null, monIdx(m[2]), Number(m[1]))));
  // Whole month: "in August", "August 2026", "during May"
  take(new RegExp(`\\b(?:(in|during|of|for|since|from|through|to|until|and)\\s+)?${MON}(?:\\s+(\\d{4}))?\\b`, "gi"), (m) => {
    const mi = monIdx(m[2]); if (mi < 0) return null;
    if (mi === 4 && !m[1] && !m[3]) return null; // "may" on its own is usually just a word
    const y = m[3] ? Number(m[3]) : iso(ty, mi, 1) > now ? ty - 1 : ty;
    return { from: iso(y, mi, 1), to: endOfMonth(y, mi), label: `${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()} ${y}` };
  });
  // Bare year: "in 2025"
  take(/\b(?:in|during|for)\s+(20\d{2})\b/g, (m) => ({ from: `${m[1]}-01-01`, to: `${m[1]}-12-31`, label: m[1] }));

  spans.sort((a, b) => a.start - b.start);
  // since / after / before / until a single date
  for (const s of spans) {
    const before = text.slice(Math.max(0, s.start - 8), s.start).toLowerCase();
    if (/\b(since|after)\s*$/.test(before)) s.op = "since";
    else if (/\b(before|until|till|til|up to|prior to)\s*$/.test(before)) s.op = "before";
  }
  return spans;
}

export function parseAsk(raw: string, now = todayISO()): Ask | null {
  const text = raw.toLowerCase().replace(/[?!]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const spans = findDates(text, now);
  let from = "", to = "";
  if (spans.length >= 2) {
    const a = spans[0], b = spans[1];
    from = a.from < b.from ? a.from : b.from; to = a.to > b.to ? a.to : b.to;
    // "9/15 to 9/1" typed backwards still works; a no-year end date before the start rolls into the next year
    if (b.single && a.single && b.from < a.from && !/\d{4}/.test(text.slice(b.start, b.end)) && b.from.slice(0, 4) === a.from.slice(0, 4)) {
      const nb = `${Number(b.from.slice(0, 4)) + 1}${b.from.slice(4)}`; if (nb <= addDays(now, 1)) { from = a.from; to = nb; }
    }
  } else if (spans.length === 1) {
    const s = spans[0];
    if (s.op === "since") { from = s.from; to = now; }
    else if (s.op === "before") { from = ""; to = s.single ? addDays(s.from, -1) : addDays(s.from, -1); }
    else { from = s.from; to = s.to; }
  }
  // Take date text out, then find the record type
  let rest = text;
  for (const s of [...spans].reverse()) rest = rest.slice(0, s.start) + " " + rest.slice(s.end);
  rest = rest.replace(/\bshow\s+(me|all|the|us)\b/g, " ");
  let kind: AskKind | "all" = "all"; let foundKind = false;
  for (const [k, re] of KINDS) {
    if (re.test(rest)) {
      kind = k; foundKind = true;
      rest = k === "care" ? careTerms(rest) : rest.replace(new RegExp(re.source, "g"), " ");
      break;
    }
  }
  if (!foundKind && !spans.length) return null;
  // Remaining helpful words become search terms (medicine, goat name, reason…)
  const terms = rest.replace(/[,;:()"]/g, " ").split(/\s+/).map((w) => w.replace(/^[-'.]+|[-'.]+$/g, "")).filter((w) => w && !STOP.has(w) && !/^(s|st|nd|rd|th)$/.test(w));
  const rangeLabel = !from && !to ? "all dates" : from === to ? fmtDate(from) : !from ? `up to ${fmtDate(to)}` : `${fmtDate(from)} – ${fmtDate(to)}`;
  return { kind, from, to, terms, rangeLabel, hasDates: spans.length > 0 };
}

/** Turn job words into the words saved on care records, so "hoof trims" finds "Hoof trim" and "care" finds all jobs */
function careTerms(t: string) {
  return t
    .replace(/\bhoo(?:f|ves)\s+trim\w*\b|\bhoo(?:f|ves)\b|\btrim(?:s|med|ming)?\b/g, " hoof ")
    .replace(/\bbody\s+condition\b|\bbcs\b/g, " condition ")
    .replace(/\bclipp?(?:ed|ing)?\b|\bshav(?:e|ed|ing)\b/g, " clipping ")
    .replace(/\bdisbud\w*\b/g, " disbudding ").replace(/\btattoo(?:s|ed)?\b/g, " tattoo ")
    .replace(/\bfecals?\b/g, " fecal ").replace(/\bblood\s+(?:draws?|tests?)\b/g, " blood ")
    .replace(/\bbath(?:s|ed)?\b/g, " bath ").replace(/\bwean(?:ed|ing)?\b/g, " weaning ")
    .replace(/\bband(?:ed|ing)\b|\bcastrat\w*\b/g, " banding ").replace(/\budder\s+checks?\b/g, " udder ")
    .replace(/\bcare(?:\s+jobs?)?\b|\bchores?\b/g, " ");
}
