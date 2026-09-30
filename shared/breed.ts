/* Breed math for kids: works out a kid's breed (and likely ADGA herdbook) from its dam and sire,
   and which tattoo location a breed uses by default (Lamanchas are tattooed in the tail web). */

const CANON: Record<string, string> = { alpine: "Alpine", ober: "Oberhasli", oberhasli: "Oberhasli", lamancha: "Lamancha", "la mancha": "Lamancha", "nigerian dwarf": "Nigerian Dwarf", nigerian: "Nigerian Dwarf", nd: "Nigerian Dwarf", nubian: "Nubian", saanen: "Saanen", toggenburg: "Toggenburg", togg: "Toggenburg", sable: "Sable", "golden guernsey": "Golden Guernsey" };
const canon = (s: string) => CANON[s.trim().toLowerCase()] ?? s.trim().replace(/\b\w/g, (c) => c.toUpperCase());

/** "50% Alpine 50% Oberhasli" → {Alpine: 50, Oberhasli: 50}; "Oberhasli" → {Oberhasli: 100}; unknown/Experimental → null */
export function parseBreed(breed?: string | null): Record<string, number> | null {
  const s = (breed ?? "").trim();
  if (!s || /^(experimental|mixed|mix|grade|unknown|cross)$/i.test(s)) return null;
  const parts = Array.from(s.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%?\s*([a-z][a-z ]*?)(?=\s*[/,&+]|\s*\d|$)/gi));
  if (parts.length) {
    const out: Record<string, number> = {};
    for (const m of parts) out[canon(m[2])] = (out[canon(m[2])] ?? 0) + Number(m[1]);
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    return Math.abs(total - 100) < 0.6 ? out : null;
  }
  return { [canon(s)]: 100 };
}

const pct = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
/** Kid gets half of each parent's makeup. Same pure breed on both sides → that breed. */
export function kidBreed(damBreed?: string | null, sireBreed?: string | null): string | null {
  const d = parseBreed(damBreed), s = parseBreed(sireBreed);
  // Both parents known but one is an unknown mix → Experimental; a parent missing → can't tell
  if (!d || !s) return damBreed?.trim() && sireBreed?.trim() ? "Experimental" : null;
  const mix: Record<string, number> = {};
  for (const [b, p] of Object.entries(d)) mix[b] = (mix[b] ?? 0) + p / 2;
  for (const [b, p] of Object.entries(s)) mix[b] = (mix[b] ?? 0) + p / 2;
  const list = Object.entries(mix).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (list.length === 1) return list[0][0];
  return list.map(([b, p]) => `${pct(p)}% ${b}`).join(" ");
}

/** Herdbook from a record, falling back to the ADGA reg # prefix (P = Purebred, A = American, E = Experimental) */
export function herdbookOf(x?: { herdbook?: string | null; regNumber?: string | null } | null): string | null {
  if (!x) return null;
  if (x.herdbook) return x.herdbook;
  const c = (x.regNumber ?? "").trim().toUpperCase()[0];
  return c === "P" ? "Purebred" : c === "A" ? "American" : c === "E" ? "Experimental" : null;
}
/** Likely herdbook for the kid: same breed Purebred × Purebred → Purebred, same breed with an American parent → American, two breeds → Experimental */
export function kidHerdbook(dam: { breed?: string | null; herdbook?: string | null; regNumber?: string | null }, sire: { breed?: string | null; herdbook?: string | null; regNumber?: string | null }): string | null {
  const kb = kidBreed(dam.breed, sire.breed);
  if (!kb) return null;
  if (kb === "Experimental" || /%/.test(kb)) return "Experimental";
  const a = herdbookOf(dam), b = herdbookOf(sire);
  if (!a || !b || a === "Grade" || b === "Grade") return null;
  if (a === "Experimental" || b === "Experimental") return "Experimental";
  if (a === "Purebred" && b === "Purebred") return "Purebred";
  return "American";
}

/** Lamanchas (tiny ears) are tattooed in the tail web */
export const isLaMancha = (breed?: string | null) => /^\s*la\s?mancha\s*$/i.test(breed ?? "");
/** Ear types: Lamanchas are gopher or elf; other breeds erect, airplane, pendulous or something typed in. Lamancha crosses can have any. */
export const LAMANCHA_EARS = ["Gopher", "Elf"];
export const OTHER_EARS = ["Erect", "Airplane", "Pendulous"];
export const earOptions = (breed?: string | null) => (isLaMancha(breed) ? LAMANCHA_EARS : /mancha/i.test(breed ?? "") ? [...LAMANCHA_EARS, ...OTHER_EARS] : OTHER_EARS);
export const normEar = (v?: string | null) => {
  const s = (v ?? "").trim();
  if (!s) return null;
  const hit = [...LAMANCHA_EARS, ...OTHER_EARS].find((o) => o.toLowerCase() === s.toLowerCase() || (s.length > 2 && o.toLowerCase().startsWith(s.toLowerCase())));
  return hit ?? s.replace(/^./, (c) => c.toUpperCase());
};
export const defaultTattooLocation = (breed?: string | null) => (isLaMancha(breed) ? "tail" : "ear");

const low = (x: any) => String(x ?? "").trim().toLowerCase().replace(/\s+/g, " ");
/** Find a parent by registered name, barn name, reg # or tattoo. If a barn name or tattoo fits more than one goat, it isn't guessed. */
export function findParent<T extends { name: string; barnName?: string | null; regNumber?: string | null; tattooRight?: string | null; tattooLeft?: string | null }>(text: string | null | undefined, list: T[]): T | null {
  const t = low(text);
  if (!t) return null;
  const strip = (s: string) => s.replace(/^goat joy\s+/, "");
  const nospace = (s: string) => s.replace(/[\s.-]/g, "");
  const tiers: ((a: T) => boolean)[] = [
    (a) => low(a.name) === t,
    (a) => !!a.regNumber && nospace(low(a.regNumber)) === nospace(t),
    (a) => strip(low(a.name)) === strip(t),
    (a) => low(a.barnName) === t,
    (a) => !!(a.tattooRight || a.tattooLeft) && low(`${a.tattooRight ?? ""} ${a.tattooLeft ?? ""}`) === t,
    (a) => !!(a.tattooRight && a.tattooLeft) && nospace(low(`${a.tattooRight}${a.tattooLeft}`)) === nospace(t),
    (a) => low(a.barnName).startsWith(t + " ") || low(a.barnName).startsWith(t + " ("), // "Mooney" for barn name "Mooney EBL V18 5553"
  ];
  for (const f of tiers) {
    const hits = list.filter(f);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}
