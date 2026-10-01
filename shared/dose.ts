/* Tablet / capsule doses measured in mg: worked out from weight (or per head), then rounded
   to the nearest amount the tablet sizes on hand can make. Used by the app and the server. */

export const TABLET_MG = "tab-mg";

type TabMed = {
  doseUnit?: string | null; doseAmount?: number | null; firstDoseAmount?: number | null; dosePerLbs?: number | null;
  tabletSizes?: string | null; tabletSplit?: boolean | null; pillForm?: string | null;
} | null | undefined;

export type TabletDose = {
  first: boolean; // first (loading) dose, or a later one
  targetMg: number; // what the weight works out to
  mg: number; // what the tablets add up to
  pieces: { size: number; count: number }[]; // count can be ½ when the tablets can be split
  count: number; // tablets in all
  form: string; // tablet | capsule
  text: string; // "22.5 mg: 1 × 15 mg + 1 × 7.5 mg tablets"
  offPct: number; // how far the tablets are from the worked-out dose, in % (+ = more)
};

export const isTabletMg = (m: TabMed) => m?.doseUnit === TABLET_MG;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "7.5, 15" -> [15, 7.5] (largest first) */
export function tabletSizes(m: TabMed) {
  return Array.from(new Set(String(m?.tabletSizes ?? "").split(/[^0-9.]+/).map(Number).filter((x) => x > 0))).sort((a, b) => b - a);
}

const countText = (c: number) => (c === 0.5 ? "½" : Number.isInteger(c) ? String(c) : `${Math.floor(c)}½`);

/** Describe a set of tablets, e.g. "1 × 15 mg + ½ × 7.5 mg tablets" */
export function piecesText(pieces: { size: number; count: number }[], form = "tablet") {
  const total = pieces.reduce((s, p) => s + p.count, 0);
  const parts = pieces.filter((p) => p.count > 0).map((p) => `${countText(p.count)} × ${r2(p.size)} mg`);
  return `${parts.join(" + ")} ${form}${total > 1 ? "s" : ""}`;
}

/** The mg dose (first or later) rounded to the nearest the tablet sizes can make. Ties round down. */
export function tabletDose(m: TabMed, lbs: number | string | null | undefined, first: boolean): TabletDose | null {
  if (!isTabletMg(m)) return null;
  const sizes = tabletSizes(m).slice(0, 4);
  if (!sizes.length) return null;
  const perLbs = Number(m!.dosePerLbs) || 0;
  const w = Number(lbs) || 0;
  if (perLbs && !(w > 0)) return null;
  const rate = first && Number(m!.firstDoseAmount) > 0 ? Number(m!.firstDoseAmount) : Number(m!.doseAmount) || 0;
  if (!(rate > 0)) return null;
  const target = perLbs ? (rate * w) / perLbs : rate;
  const step = m!.tabletSplit ? 0.5 : 1;
  const maxSteps = sizes.map((s) => Math.min(80, Math.ceil(target / (s * step)) + 1));
  let best: { total: number; counts: number[]; n: number } | null = null;
  const counts = new Array(sizes.length).fill(0);
  const walk = (i: number, total: number) => {
    if (i === sizes.length) {
      if (total <= 0) return;
      const n = counts.reduce((s, c) => s + Math.ceil(c), 0);
      const d = Math.abs(total - target), bd = best ? Math.abs(best.total - target) : Infinity;
      if (!best || d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && (total < best.total - 1e-9 || (Math.abs(total - best.total) < 1e-9 && n < best.n))))
        best = { total, counts: [...counts], n };
      return;
    }
    for (let k = 0; k <= maxSteps[i]; k++) { counts[i] = k * step; walk(i + 1, total + counts[i] * sizes[i]); }
    counts[i] = 0;
  };
  walk(0, 0);
  if (!best) return null;
  const b = best as { total: number; counts: number[] };
  const pieces = sizes.map((size, i) => ({ size, count: b.counts[i] })).filter((p) => p.count > 0);
  const form = m!.pillForm === "capsule" ? "capsule" : "tablet";
  const mg = r2(b.total);
  return { first, targetMg: r2(target), mg, pieces, count: pieces.reduce((s, p) => s + p.count, 0), form, text: `${mg} mg: ${piecesText(pieces, form)}`,
    offPct: target ? Math.round(((mg - target) / target) * 100) : 0 };
}

/** The treatment fields for a tablet dose */
export const tabletFields = (d: TabletDose) => ({ doseMl: null, pillCount: d.count, pillUnit: d.form, doseMg: d.mg, doseDetail: d.text });

/** "1 mg per 2.25 lb first dose, then 0.5 mg per 2.25 lb · 7.5 / 15 mg tablets" */
export function tabletRuleText(m: TabMed) {
  const per = Number(m?.dosePerLbs) || 0;
  const rate = (x: number) => (per ? `${x} mg per ${per} lb` : `${x} mg per head`);
  const sizes = tabletSizes(m).slice().reverse().map(r2).join(" / ");
  const form = m?.pillForm === "capsule" ? "capsules" : "tablets";
  const f = Number(m?.firstDoseAmount) || 0, d = Number(m?.doseAmount) || 0;
  const rule = f > 0 && f !== d ? `${rate(f)} first dose, then ${rate(d)}` : rate(d);
  return `${rule}${sizes ? ` · ${sizes} mg ${form}${m?.tabletSplit ? " (can split)" : ""}` : ""}`;
}
