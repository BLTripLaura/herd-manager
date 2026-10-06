/* Filing cabinet helpers: upload in pieces, load a file back, print it, send it */
import { apiRequest, queryClient } from "@/lib/queryClient";
import { resize } from "@/components/photos";

export type Cabinet = "reference" | "sale";
export type Doc = { id: number; cabinet: Cabinet; title: string; folder: string | null; animalId: number | null; docDate: string | null; notes: string | null; fileName: string; mime: string | null; size: number | null; chunks: number; thumb: string | null; createdAt: string; createdBy: string | null };
export const CABINET_LABEL: Record<Cabinet, string> = { reference: "Reference documents", sale: "Sale documents" };
export const FOLDERS: Record<Cabinet, string[]> = {
  reference: ["Vet & health", "Medications & labels", "Feeding & minerals", "Equipment manuals", "Registration & ADGA", "Milk & dairy", "Farm & business"],
  sale: ["Bills of sale", "Health certificates", "Registration transfers", "Contracts & deposits", "Receipts", "Buyer info"],
};
const PIECE = 3_000_000; // characters of base64 per request (about 2.2 MB of file)
export const MAX_MB = 30;

const toDataUrl = (f: Blob) => new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(f); });
export const isImage = (mime?: string | null, name?: string) => (mime ?? "").startsWith("image/") || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(name ?? "");
export const isPdf = (mime?: string | null, name?: string) => mime === "application/pdf" || /\.pdf$/i.test(name ?? "");
export const fmtSize = (b?: number | null) => (!b ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/** Put a file in a cabinet. Big photos are shrunk to a clear 2400 px copy first. */
export async function uploadDoc(file: File, meta: { cabinet: Cabinet; title: string; folder?: string | null; animalId?: number | null; docDate?: string | null; notes?: string | null }, onProgress?: (p: number) => void): Promise<Doc> {
  let mime = file.type || "application/octet-stream", name = file.name, dataUrl: string;
  let thumb: string | null = null;
  if (isImage(mime, name) && !/gif$/i.test(mime)) {
    dataUrl = file.size > 1_500_000 ? await resize(file, 2400, 0.85) : await toDataUrl(file);
    if (file.size > 1_500_000) { mime = "image/jpeg"; name = name.replace(/\.[^.]+$/, "") + ".jpg"; }
    thumb = await resize(file, 240, 0.7).catch(() => null);
  } else dataUrl = await toDataUrl(file);
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const size = Math.round((b64.length * 3) / 4);
  if (size > MAX_MB * 1024 * 1024) throw new Error(`That file is over ${MAX_MB} MB. Try a smaller copy.`);
  const chunks = Math.max(1, Math.ceil(b64.length / PIECE));
  const { id } = await (await apiRequest("POST", "/api/documents", { ...meta, fileName: name, mime, size, chunks, thumb })).json();
  for (let n = 0; n < chunks; n++) {
    await apiRequest("POST", `/api/documents/${id}/chunk/${n}`, { data: b64.slice(n * PIECE, (n + 1) * PIECE) });
    onProgress?.((n + 1) / chunks);
  }
  const doc = await (await apiRequest("POST", `/api/documents/${id}/finish`)).json();
  queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
  return doc;
}

/** Load a stored file back as a File (for preview, print and send) */
export async function loadDoc(d: { id?: number; chunks: number; mime: string | null; fileName: string }, base = `/api/documents/${d.id}`, onProgress?: (p: number) => void): Promise<File> {
  let b64 = "";
  for (let n = 0; n < d.chunks; n++) {
    const r = await fetch(`${base}/chunk/${n}`);
    if (!r.ok) throw new Error("Could not load the file");
    b64 += (await r.json()).data; onProgress?.((n + 1) / d.chunks);
  }
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], d.fileName, { type: d.mime || "application/octet-stream" });
}

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const canShareFile = (f: File | null) => { try { return !!f && !!navigator.canShare && navigator.canShare({ files: [f] }); } catch { return false; } };

/** Print. Pictures and PDFs print straight from the app; on an iPad the PDF opens full screen (or the share sheet, which has Print). */
export async function printDoc(file: File, url: string, title: string): Promise<"printed" | "opened" | "shared" | "downloaded"> {
  if (isImage(file.type, file.name)) {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(`<!doctype html><title>${title.replace(/</g, "&lt;")}</title><style>@page{margin:12mm}body{margin:0}img{max-width:100%;max-height:100vh;display:block;margin:0 auto}</style><img src="${url}" onload="setTimeout(function(){window.print()},200)">`);
      w.document.close(); return "printed";
    }
  }
  if (isPdf(file.type, file.name)) {
    if (isIOS()) {
      if (canShareFile(file)) { await navigator.share({ files: [file], title }); return "shared"; }
      window.open(url, "_blank"); return "opened";
    }
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    f.src = url; document.body.appendChild(f);
    f.onload = () => { try { f.contentWindow?.focus(); f.contentWindow?.print(); } catch { window.open(url, "_blank"); } setTimeout(() => f.remove(), 60_000); };
    return "printed";
  }
  const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); return "downloaded";
}

/** A link anyone can open for 7 days (for texting or emailing) */
export async function shareLink(id: number) {
  const { token, expiresAt } = await (await apiRequest("POST", `/api/documents/${id}/share`)).json();
  const base = window.location.href.split("#")[0];
  return { url: `${base}#/shared/${token}`, expiresAt: String(expiresAt) };
}
