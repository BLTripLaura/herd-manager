/* Travel lists for a CVI (health certificate) — the rows the vet needs for GlobalVetLink */
import type { Animal, Treatment, Breeding, Trip } from "@shared/schema";
import { goatName, daysBetween, isCdt, fmtDate } from "@/lib/herd";

export type Origin = { owner?: string; farm?: string; address?: string; city?: string; state?: string; zip?: string; phone?: string; email?: string; premisesId?: string; flockId?: string; vetName?: string; vetEmail?: string };
export const ORIGIN_KEY = ["/api/settings/cviOrigin"];
export const PURPOSES = ["Exhibition / show", "Sale", "Breeding", "Return to origin", "Lease", "Veterinary care", "Personal / pet", "Other"];

export const idsOf = (t?: Pick<Trip, "animalIds"> | null) => String(t?.animalIds ?? "").split(",").map(Number).filter(Boolean);

export function ageAt(dob: string | null | undefined, on: string) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return "";
  const months = Math.floor(daysBetween(dob, on) / 30.44);
  if (months < 0) return "";
  if (months < 12) return `${months} mo`;
  const y = Math.floor(months / 12), m = months % 12;
  return m ? `${y} yr ${m} mo` : `${y} yr`;
}
const sexLabel = (s?: string | null) => ({ doe: "Female", buck: "Male (intact)", wether: "Male (wether)" } as Record<string, string>)[String(s ?? "").toLowerCase()] ?? (s ?? "");

export type CviRow = Record<string, string>;
export const COLUMNS: { key: string; label: string; w: number }[] = [
  { key: "n", label: "#", w: 4 }, { key: "barn", label: "Barn name", w: 18 }, { key: "reg", label: "Registered name", w: 30 },
  { key: "regNo", label: "ADGA reg #", w: 13 }, { key: "species", label: "Species", w: 8 }, { key: "breed", label: "Breed", w: 16 },
  { key: "herdbook", label: "Herdbook", w: 11 }, { key: "sex", label: "Sex", w: 13 }, { key: "dob", label: "Date of birth", w: 12 }, { key: "age", label: "Age", w: 9 },
  { key: "color", label: "Color / markings", w: 22 }, { key: "tatR", label: "Tattoo right", w: 11 }, { key: "tatL", label: "Tattoo left", w: 11 }, { key: "tatLoc", label: "Tattoo location", w: 11 },
  { key: "tag", label: "Scrapie / official ear tag", w: 18 }, { key: "chip", label: "Microchip", w: 17 }, { key: "chipLoc", label: "Chip location", w: 10 },
  { key: "officialId", label: "Official ID used", w: 26 }, { key: "horns", label: "Horns", w: 10 }, { key: "repro", label: "Pregnant / in milk", w: 14 }, { key: "cdt", label: "Last CD&T", w: 11 },
];

/** What the vet will ask about if it's missing */
export function problems(a: Animal): string[] {
  const p: string[] = [];
  const tattoo = !!(a.tattooRight || a.tattooLeft);
  if (!a.tag && !(tattoo && a.regNumber) && !a.microchip) p.push("no official ID (scrapie tag, registry tattoo or microchip)");
  if (tattoo && !a.regNumber && !a.tag) p.push("tattoo without a registration number");
  if (!a.dob) p.push("no birth date");
  if (!a.color) p.push("no color");
  if (!a.breed) p.push("no breed");
  return p;
}

export function rows(trip: Pick<Trip, "shipDate" | "animalIds">, animals: Animal[], treatments: Treatment[], breedings: Breeding[]): CviRow[] {
  const byId = new Map(animals.map((a) => [a.id, a]));
  return idsOf(trip).map((id) => byId.get(id)).filter(Boolean).map((a, i) => {
    a = a!;
    const cdt = treatments.filter((t) => t.animalId === a!.id && isCdt(t.medName) && t.date <= trip.shipDate).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
    const preg = breedings.some((b) => b.doeId === a!.id && b.status === "confirmed");
    const milk = ["milking", "mastitis", "drying"].includes(String(a.milkStatus ?? "")) || !!a.inMilk;
    const ids: string[] = [];
    if (a.tag) ids.push(`Scrapie tag ${a.tag}`);
    if ((a.tattooRight || a.tattooLeft) && a.regNumber) ids.push(`Registry tattoo ${[a.tattooRight, a.tattooLeft].filter(Boolean).join(" / ")} (papers travel)`);
    if (a.microchip) ids.push(`Microchip ${a.microchip}`);
    const bn = goatName(a);
    return {
      n: String(i + 1), barn: bn, reg: a.name ?? "", regNo: a.regNumber ?? "", species: "Goat", breed: a.breed ?? "", herdbook: a.herdbook ?? "",
      sex: sexLabel(a.sex), dob: a.dob ? fmtDate(a.dob) : "", age: ageAt(a.dob, trip.shipDate), color: [a.color, a.earType ? `${a.earType} ears` : "", a.eyeColor && a.eyeColor !== "Brown" ? `${a.eyeColor} eyes` : ""].filter(Boolean).join(", "),
      tatR: a.tattooRight ?? "", tatL: a.tattooLeft ?? "", tatLoc: a.tattooRight || a.tattooLeft ? (a.tattooLocation === "tail" ? "Tail web" : "Ears") : "",
      tag: a.tag ?? "", chip: a.microchip ?? "", chipLoc: a.microchip ? (a.chipLocation === "tail" ? "Tail web" : a.chipLocation ? `${a.chipLocation[0].toUpperCase()}${a.chipLocation.slice(1)}` : "") : "",
      officialId: ids.join("; "), horns: a.hornStatus ?? "", repro: [a.sex === "doe" && preg ? "Pregnant" : "", a.sex === "doe" && milk ? "In milk" : ""].filter(Boolean).join(", "), cdt: cdt ? fmtDate(cdt.date) : "",
    };
  });
}

const line = (...p: (string | null | undefined)[]) => p.filter((x) => x && String(x).trim()).join(", ");
export const destText = (t: Trip) => line(t.destName, t.destAddress, line(t.destCity, [t.destState, t.destZip].filter(Boolean).join(" ")));
export const originText = (o: Origin) => line(o.farm || o.owner, o.address, line(o.city, [o.state, o.zip].filter(Boolean).join(" ")));
export const fileBase = (t: Trip) => `CVI list ${t.shipDate} ${t.destName}`.replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim();

/** Excel workbook: a Trip sheet (shipment details) and an Animals sheet (one row per goat) */
export async function workbook(t: Trip, o: Origin, list: CviRow[]): Promise<File> {
  const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook(); wb.creator = "Herd Manager";
  const s = wb.addWorksheet("Trip");
  const info: [string, string][] = [
    ["Certificate of Veterinary Inspection — travel list", ""], ["", ""],
    ["Shipping date", fmtDate(t.shipDate)], ["Return date", t.returnDate ? fmtDate(t.returnDate) : ""], ["Purpose of movement", t.purpose], ["Number of goats", String(list.length)], ["Species", "Goat (caprine)"],
    ["", ""], ["CONSIGNOR / ORIGIN", ""], ["Owner", o.owner ?? ""], ["Farm", o.farm ?? ""], ["Address", o.address ?? ""], ["City, State ZIP", line(o.city, [o.state, o.zip].filter(Boolean).join(" "))], ["Phone", o.phone ?? ""], ["Email", o.email ?? ""],
    ["Premises ID (PIN)", o.premisesId ?? ""], ["Scrapie flock ID", o.flockId ?? ""],
    ["", ""], ["CONSIGNEE / DESTINATION", ""], ["Destination", t.destName], ["Address", t.destAddress ?? ""], ["City, State ZIP", line(t.destCity, [t.destState, t.destZip].filter(Boolean).join(" "))], ["Phone", t.destPhone ?? ""], ["Consignee (person)", t.consignee ?? ""],
    ["", ""], ["Carrier", t.carrier ?? ""], ["Notes", t.notes ?? ""],
  ];
  info.forEach((r) => s.addRow(r));
  s.getColumn(1).width = 24; s.getColumn(2).width = 60;
  s.getRow(1).font = { bold: true, size: 13 };
  [9, 19].forEach((n) => (s.getRow(n).font = { bold: true }));
  const a = wb.addWorksheet("Animals", { views: [{ state: "frozen", ySplit: 1 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  a.columns = COLUMNS.map((c) => ({ header: c.label, key: c.key, width: c.w }));
  list.forEach((r) => a.addRow(r));
  a.getRow(1).font = { bold: true }; a.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  ["regNo", "tatR", "tatL", "tag", "chip"].forEach((k) => (a.getColumn(k).numFmt = "@"));
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], `${fileBase(t)}.xlsx`, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const esc = (x: any) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]);
/** Printable page (landscape) */
export function printHtml(t: Trip, o: Origin, list: CviRow[]) {
  const cols = COLUMNS.filter((c) => !["species", "chipLoc"].includes(c.key));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileBase(t))}</title><style>
  @page{size:landscape;margin:10mm}body{font:11px/1.35 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;margin:0}
  h1{font-size:16px;margin:0 0 6px}.g{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px}.b{border:1px solid #999;border-radius:4px;padding:6px 8px}
  .b h2{font-size:10px;text-transform:uppercase;letter-spacing:.04em;margin:0 0 3px;color:#444}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 4px;text-align:left;vertical-align:top}
  th{background:#eee;font-size:10px}td{font-size:10.5px}tr{page-break-inside:avoid}</style></head><body>
  <h1>Travel list for CVI — ${esc(list.length)} goat${list.length === 1 ? "" : "s"}</h1>
  <div class="g">
   <div class="b"><h2>Shipment</h2>Ship date: <b>${esc(fmtDate(t.shipDate))}</b>${t.returnDate ? `<br>Return: ${esc(fmtDate(t.returnDate))}` : ""}<br>Purpose: <b>${esc(t.purpose)}</b>${t.carrier ? `<br>Carrier: ${esc(t.carrier)}` : ""}</div>
   <div class="b"><h2>Consignor / origin</h2>${esc(o.owner)}${o.farm ? `<br>${esc(o.farm)}` : ""}<br>${esc(o.address)}<br>${esc(line(o.city, [o.state, o.zip].filter(Boolean).join(" ")))}${o.phone ? `<br>${esc(o.phone)}` : ""}${o.premisesId ? `<br>Premises ID: ${esc(o.premisesId)}` : ""}${o.flockId ? `<br>Scrapie flock ID: ${esc(o.flockId)}` : ""}</div>
   <div class="b"><h2>Consignee / destination</h2><b>${esc(t.destName)}</b>${t.consignee ? `<br>${esc(t.consignee)}` : ""}<br>${esc(t.destAddress)}<br>${esc(line(t.destCity, [t.destState, t.destZip].filter(Boolean).join(" ")))}${t.destPhone ? `<br>${esc(t.destPhone)}` : ""}</div>
  </div>
  <table><thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>
  ${list.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c.key])}</td>`).join("")}</tr>`).join("")}
  </tbody></table>${t.notes ? `<p><b>Notes:</b> ${esc(t.notes)}</p>` : ""}
  <script>setTimeout(function(){window.print()},300)</script></body></html>`;
}
