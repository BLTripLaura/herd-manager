import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import { findParent } from "@shared/breed";

/* Reads a photo of a goat registration certificate (ADGA and similar) and returns the fields the app uses.
   Nothing is saved here: the app shows everything for review first. */

const PATHS = ["S", "D", "SS", "SD", "DS", "DD", "SSS", "SSD", "SDS", "SDD", "DSS", "DSD", "DDS", "DDD"];

const PROMPT = `You are reading a photo of a dairy goat registration certificate (usually ADGA, sometimes AGS, AOA, NDGA or another registry).
Return ONLY a JSON object, no other text, with these keys (use null when a value is missing or unreadable, never guess):
{
 "registry": "ADGA" etc,
 "name": registered name exactly as printed (keep the herd name prefix),
 "regNumber": registration number exactly as printed, including letter prefix,
 "herdbook": one of "Purebred","American","Experimental","Grade","Native on Appearance" or null,
 "breed": breed as printed (use "Lamancha" spelling for LaMancha),
 "sex": "doe","buck" or "wether",
 "dob": birth date as YYYY-MM-DD,
 "color": color/markings description as printed, without the eye color (e.g. "Gold"),
 "eyeColor": "Blue" if the description or paper says blue eyes, "Brown" if it says brown eyes, else null,
 "earType": ear information as printed, in title case (e.g. "Erect", "Gopher", "Elf", "Airplane", "Pendulous"),
 "tattooRight": right ear (or tail-web if the goat is tattooed in the tail web, first line) tattoo exactly as printed,
 "tattooLeft": left ear (or tail-web second line) tattoo exactly as printed,
 "tattooLocation": "tail" if the tattoo is in the tail web, otherwise "ear",
 "microchip": microchip / EID number only if one is actually printed (15 digits); null if the EID line is blank,
 "hornStatus": "polled" if the paper says polled, "horned"/"disbudded" only if printed, else null,
 "breeder": breeder name, "owner": owner name, "ownerDate": date of ownership as YYYY-MM-DD if printed,
 "ancestors": object keyed by pedigree position with {"name":..., "reg":..., "extra":...} where positions are
   S = sire, D = dam, SS = sire's sire, SD = sire's dam, DS = dam's sire, DD = dam's dam,
   SSS, SSD, SDS, SDD, DSS, DSD, DDS, DDD for great-grandparents (sire side first, sire above dam, as on the paper).
   "extra" holds awards/LA scores/milk stars printed with that ancestor (e.g. "SGCH", "4*M", "VEEE 90"), or null.
   Include every position you can read.
 "fourthGeneration": list of strings "name (reg)" for any 4th-generation ancestors printed, or [],
 "other": other useful printed facts NOT already covered by the keys above (e.g. DNA status of the goat itself, linear appraisal, milk records, EID), or null. Do not repeat tattoo, breeder, owner, IDs or dates here,
 "confidence": "high" if the photo was clear, "low" if parts were blurry, cut off or hard to read,
 "unclear": list of field names you were not sure about
}`;

function parseJson(t: string) {
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("no json");
  return JSON.parse(t.slice(s, e + 1));
}

/** Papers print names in capitals; herd records read better in title case ("DWARF LUNACY LITTLE MISS" -> "Dwarf Lunacy Little Miss") */
export function nameCase(v: string | null) {
  if (!v || /[a-z]/.test(v)) return v;
  const small = new Set(["of", "the", "and", "a", "an", "in", "on", "at", "to", "for", "by", "de", "la", "le"]);
  return v.split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w)) return w;
    const l = w.toLowerCase();
    if (i > 0 && small.has(l)) return l;
    return l.replace(/(^|[-'’(])([a-z])/g, (_m, a, b) => a + b.toUpperCase()).replace(/^(\d+)([a-z])/, (_m, d, c) => d + c.toUpperCase());
  }).join("");
}

const clean = (v: any) => (typeof v === "string" ? v.trim() || null : v ?? null);

export async function scanPapers(images: string[]) {
  if (!process.env.ANTHROPIC_API_KEY) { const e: any = new Error("no-key"); e.noKey = true; throw e; }
  const client = new Anthropic();
  const content: any[] = images.map((d) => {
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(d);
    if (!m) throw new Error("bad image");
    return { type: "image", source: { type: "base64", media_type: m[1] === "image/jpg" ? "image/jpeg" : m[1], data: m[2] } };
  });
  content.push({ type: "text", text: images.length > 1 ? PROMPT + "\nThe photos are the front and back of the same certificate." : PROMPT });
  const msg = await client.messages.create({ model: process.env.SCAN_MODEL || "claude-sonnet-4-5", max_tokens: 3000, messages: [{ role: "user", content }] });
  const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
  const raw = parseJson(text);

  const out: any = {};
  for (const k of ["registry", "name", "regNumber", "herdbook", "breed", "sex", "dob", "color", "eyeColor", "earType", "tattooRight", "tattooLeft", "tattooLocation", "microchip", "hornStatus", "breeder", "owner", "ownerDate", "other", "confidence"]) out[k] = clean(raw[k]);
  if (out.breed) out.breed = String(out.breed).replace(/la\s?mancha/i, "Lamancha");
  if (out.sex && !["doe", "buck", "wether"].includes(String(out.sex).toLowerCase())) out.sex = null;
  if (out.sex) out.sex = String(out.sex).toLowerCase();
  if (out.dob && !/^\d{4}-\d{2}-\d{2}$/.test(out.dob)) out.dob = null;
  out.name = nameCase(out.name); out.breeder = nameCase(out.breeder); out.owner = nameCase(out.owner);
  const title = (v: any) => (v ? String(v).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : v);
  out.color = title(out.color); out.earType = title(out.earType); out.eyeColor = title(out.eyeColor);
  if (out.hornStatus) out.hornStatus = String(out.hornStatus).toLowerCase();
  // Only a real 15-digit chip number counts; a blank EID line on the paper means no chip yet
  if (out.microchip) { const d = String(out.microchip).replace(/\D/g, ""); out.microchip = d.length === 15 ? d : null; }
  out.unclear = Array.isArray(raw.unclear) ? raw.unclear.map(String) : [];
  out.fourthGeneration = Array.isArray(raw.fourthGeneration) ? raw.fourthGeneration.map(String).filter(Boolean) : [];
  out.ancestors = {};
  for (const p of PATHS) {
    const e = raw.ancestors?.[p];
    if (e && (clean(e.name) || clean(e.reg))) out.ancestors[p] = { name: nameCase(clean(e.name)), reg: clean(e.reg), extra: clean(e.extra) };
  }

  // Which goat in the herd is this? Reg # first, then name, then tattoo
  const animals = await storage.list("animals");
  const norm = (x: any) => String(x ?? "").toLowerCase().replace(/[\s.-]/g, "");
  let match = out.regNumber ? animals.find((a) => a.regNumber && norm(a.regNumber) === norm(out.regNumber)) : null;
  let why = match ? "same registration number" : "";
  if (!match && out.name) { match = findParent(out.name, animals); if (match) why = "same name"; }
  if (!match && out.tattooRight && out.tattooLeft) {
    const hits = animals.filter((a) => norm(a.tattooRight) === norm(out.tattooRight) && norm(a.tattooLeft) === norm(out.tattooLeft));
    if (hits.length === 1) { match = hits[0]; why = "same tattoo"; }
  }
  // Parents already in the herd
  const linked: Record<string, { id: number; name: string } | null> = {};
  for (const p of ["S", "D"]) {
    const e = out.ancestors[p];
    const g = e ? (e.reg ? animals.find((a) => a.regNumber && norm(a.regNumber) === norm(e.reg)) : null) ?? findParent(e.name, animals) : null;
    linked[p] = g && g.id !== match?.id ? { id: g.id, name: g.name } : null;
  }
  return { fields: out, match: match ? { id: match.id, name: match.name, why } : null, linked };
}
