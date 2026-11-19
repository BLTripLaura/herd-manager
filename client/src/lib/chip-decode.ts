/* Turn whatever a microchip reader typed into the 15-digit ISO number(s) it could mean,
   so a reader set to decimal or to hex both work.
   Decimal: "982000123456789", "982 000123456789", "982.000.123.456.789" (a longer number uses its last 15 digits).
   Hex (ISO 11784: 10-bit country + 38-bit national ID):
     13 hex  "3D600075BCD15"   country 3 hex + national 10 hex
     split   "3D6.00075BCD15" / "3D6 00075BCD15"
     12 hex  48-bit value (country << 38 | national)
     16 hex  full 64-bit code, as sent, bit-reversed or byte-reversed */
export type ChipCandidate = { chip: string; how: "decimal" | "hex" };

const SEP = /[\s._:\-/]/g;
export const chipCompact = (raw: string) => String(raw ?? "").replace(SEP, "").toUpperCase();

export function chipCandidates(raw: string): ChipCandidate[] {
  const s = String(raw ?? "").trim();
  const out: ChipCandidate[] = [];
  const seen = new Set<string>();
  const add = (c: number, n: bigint, how: ChipCandidate["how"]) => {
    if (!(c >= 1 && c <= 999) || n < BigInt(0) || n > BigInt("999999999999")) return;
    const d = String(c).padStart(3, "0") + n.toString().padStart(12, "0");
    if (!seen.has(d)) { seen.add(d); out.push({ chip: d, how }); }
  };
  const ONE = BigInt(1);
  const MASK38 = (ONE << BigInt(38)) - ONE;
  const MASK48 = (ONE << BigInt(48)) - ONE;
  const split48 = (v: bigint) => add(Number((v >> BigInt(38)) & BigInt(0x3ff)), v & MASK38, "hex");
  const revBits = (v: bigint, bits: number) => { let r = BigInt(0); for (let i = 0; i < bits; i++) { r = (r << ONE) | (v & ONE); v >>= ONE; } return r; };

  const compact = s.replace(SEP, "");
  if (!compact) return out;
  const allDigits = /^\d+$/.test(compact);
  if (allDigits && compact.length >= 15) add(Number(compact.slice(-15, -12)), BigInt(compact.slice(-12)), "decimal");
  if (!/^[0-9a-f]+$/i.test(compact)) return out;
  const parts = s.split(/[\s._:\-/]+/).filter(Boolean);
  if (parts.length === 2 && parts[0].length <= 3 && parts[1].length >= 8 && parts[1].length <= 10) add(parseInt(parts[0], 16), BigInt("0x" + parts[1]), "hex");
  if (allDigits && compact.length >= 15) return out; // a full decimal number is never re-read as hex
  const v = BigInt("0x" + compact);
  if (compact.length === 13) add(parseInt(compact.slice(0, 3), 16), BigInt("0x" + compact.slice(3)), "hex");
  if (compact.length === 12) split48(v);
  if (compact.length === 16) {
    split48(v & MASK48);
    split48(revBits(v, 64) & MASK48);
    split48(BigInt("0x" + compact.match(/../g)!.reverse().join("")) & MASK48);
  }
  return out;
}

/** True when this looks like a whole chip code (15+ digits, or 12+ hex characters that decode), not a half-typed number */
export function chipComplete(raw: string) {
  const c = chipCompact(raw);
  return chipCandidates(raw).length > 0 && (/^\d+$/.test(c) ? c.length >= 15 : c.length >= 12);
}
export const chipHasLetters = (raw: string) => /[A-F]/.test(chipCompact(raw));
