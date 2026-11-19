import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ScanLine, SearchX, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useList, fmtChip, goatName, type Animal } from "@/lib/herd";
import { useApp } from "@/components/shell";
import { useToast } from "@/hooks/use-toast";

/* Scan a goat: a Bluetooth microchip reader in keyboard (HID) mode "types" the chip number and presses Enter.
   - The Scan button opens a box that waits for the reader (or a typed number) and opens the goat's page.
   - A scan made while no text box is in use is also picked up on any page (fast keystrokes only, so normal typing is never taken).
   - A scan into a text box (a goat form's microchip field, the search box) goes into that box as usual.
   Matching is exact on the stored 15-digit microchip, never a partial number or a name. */

/** Digits only: spaces, dots, dashes and other separators the reader adds are dropped */
export const chipDigits = (raw: string) => raw.replace(/\D/g, "");
const looksHex = (raw: string) => /[a-f]/i.test(raw.replace(/[^0-9a-z]/gi, "")) && /^[0-9a-f\s.:_-]+$/i.test(raw.trim());

/** Goats whose stored microchip is exactly this number */
export function goatsByChip(animals: Animal[], raw: string): Animal[] {
  const d = chipDigits(raw);
  if (d.length < 9) return [];
  const exact = animals.filter((a) => a.microchip && chipDigits(a.microchip) === d);
  if (exact.length || d.length <= 15) return exact;
  // Some readers put an extra flag digit in front: try the last 15
  const tail = d.slice(-15);
  return animals.filter((a) => a.microchip && chipDigits(a.microchip) === tail);
}

type Result = { kind: "none"; raw: string } | { kind: "many"; raw: string; goats: Animal[] } | null;

const editable = (el: Element | null) => {
  if (!el) return false;
  const h = el as HTMLElement;
  if (h.isContentEditable) return true;
  const tag = h.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = ((h as HTMLInputElement).type || "text").toLowerCase();
  return !["button", "checkbox", "radio", "submit", "reset", "file", "range", "color", "image"].includes(type);
};
const otherDialogOpen = () => !!document.querySelector('[role="dialog"][data-state="open"]:not([data-scan-dialog]), [role="alertdialog"][data-state="open"]');

export function ScanGoat() {
  const { data: animals = [] } = useList("animals");
  const { setHerdQ } = useApp();
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<Result>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const last = useRef<{ chip: string; at: number }>({ chip: "", at: 0 });
  const autoTimer = useRef<number>();

  const openGoat = useCallback((a: Animal) => {
    setOpen(false); setTyped(""); setResult(null);
    (document.activeElement as HTMLElement | null)?.blur?.();
    nav(`/animal/${a.id}`);
    toast({ title: `Opened ${goatName(a)}`, description: `Chip ${fmtChip(a.microchip)}${a.status !== "active" ? ` · ${a.status}` : ""}` });
  }, [nav, toast]);

  /** Look up a scanned or typed number. Returns true when it was handled. */
  const lookUp = useCallback((raw: string, fromReader: boolean) => {
    const d = chipDigits(raw);
    if (!raw.trim()) return false;
    // The same chip read twice in a row (reader held over the goat) does not keep reopening the page
    const now = Date.now();
    if (fromReader && d && d === last.current.chip && now - last.current.at < 4000) { last.current.at = now; return true; }
    last.current = { chip: d, at: now };
    const hits = goatsByChip(animals, raw);
    if (hits.length === 1) { openGoat(hits[0]); return true; }
    setTyped(""); setResult(hits.length ? { kind: "many", raw, goats: hits } : { kind: "none", raw });
    setOpen(true);
    return true;
  }, [animals, openGoat]);

  // Reader scans made anywhere in the app while no text box is in use
  useEffect(() => {
    let buf = "", lastKey = 0, fast = true, idle: number | undefined;
    const reset = () => { buf = ""; fast = true; window.clearTimeout(idle); };
    const finish = () => {
      const raw = buf; const ok = fast && chipDigits(raw).length >= 9; reset();
      return ok ? lookUp(raw, true) : false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (open || e.ctrlKey || e.metaKey || e.altKey) return;
      if (editable(document.activeElement) || otherDialogOpen()) { reset(); return; }
      const now = performance.now();
      if (e.key === "Enter" || e.key === "Tab") {
        if (buf && now - lastKey < 150 && finish()) e.preventDefault(); else reset();
        return;
      }
      if (e.key.length !== 1) return;
      if (!buf || now - lastKey > 80) { buf = ""; fast = true; } // a pause starts a new read
      buf += e.key; lastKey = now;
      if (buf.length > 40) fast = false;
      // Readers set to send no Enter: a quick burst of 15+ digits followed by a pause counts as a scan
      window.clearTimeout(idle);
      idle = window.setTimeout(() => { if (chipDigits(buf).length >= 15) finish(); else reset(); }, 200);
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.clearTimeout(idle); };
  }, [open, lookUp]);

  // Inside the Scan box: readers that don't press Enter are looked up once 15 digits have arrived
  useEffect(() => {
    window.clearTimeout(autoTimer.current);
    if (open && chipDigits(typed).length >= 15) autoTimer.current = window.setTimeout(() => lookUp(typed, true), 250);
    return () => window.clearTimeout(autoTimer.current);
  }, [typed, open, lookUp]);

  const start = () => { setResult(null); setTyped(""); setOpen(true); };
  const again = () => { setResult(null); setTyped(""); last.current = { chip: "", at: 0 }; setTimeout(() => inputRef.current?.focus(), 0); };
  const close = (v: boolean) => { setOpen(v); if (!v) { setResult(null); setTyped(""); } };
  const raw = result?.raw ?? "";
  const shownChip = chipDigits(raw).length === 15 ? fmtChip(chipDigits(raw)) : raw.trim();

  return (
    <>
      <Button variant="outline" onClick={start} className="h-10 shrink-0 gap-1.5 bg-card px-3" aria-label="Scan a goat's microchip" data-testid="button-scan-goat">
        <ScanLine className="h-4 w-4" /><span className="hidden sm:inline">Scan a goat</span><span className="sm:hidden">Scan</span>
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent data-scan-dialog className="max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-primary" />Scan a goat</DialogTitle>
            <DialogDescription>Hold the reader over the goat's chip and press its read button. The goat's page opens by itself.</DialogDescription>
          </DialogHeader>

          {result?.kind === "none" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40" data-testid="scan-not-found">
              <div className="flex items-center gap-2 font-semibold"><SearchX className="h-4 w-4" />No goat has this chip</div>
              <div className="mt-1 font-mono tabular-nums" data-testid="text-scan-chip">{shownChip}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {looksHex(raw) ? "This looks like a hex number. Set the reader to decimal output, then scan again."
                  : chipDigits(raw).length !== 15 ? `It has ${chipDigits(raw).length} digits. Goat chips stored here are 15 digits.`
                  : "Check the number against the goat's papers. To add it, open the goat and use Edit."}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={again} data-testid="button-scan-again">Scan again</Button>
                <Button size="sm" variant="outline" onClick={() => { setHerdQ(chipDigits(raw).slice(-6) || raw.trim()); close(false); nav("/herd"); }} data-testid="button-scan-search">Search the herd</Button>
              </div>
            </div>
          )}

          {result?.kind === "many" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40" data-testid="scan-duplicates">
              <div className="flex items-center gap-2 font-semibold"><TriangleAlert className="h-4 w-4" />{result.goats.length} goats have this chip</div>
              <div className="mt-1 font-mono tabular-nums">{shownChip}</div>
              <p className="mt-1 text-xs text-muted-foreground">A chip should belong to one goat. Pick the goat in front of you, then fix the other record.</p>
              <ul className="mt-2 divide-y rounded-md border bg-card">
                {result.goats.map((a) => (
                  <li key={a.id}><button onClick={() => openGoat(a)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent" data-testid={`scan-pick-${a.id}`}>
                    <span className="flex h-8 min-w-[2.5rem] items-center justify-center rounded-md bg-muted px-1 text-xs font-bold tabular-nums">{a.tag || "—"}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{goatName(a)}<span className="ml-1.5 text-xs font-normal capitalize text-muted-foreground">{a.sex}{a.status !== "active" ? ` · ${a.status}` : ""}</span></span>
                  </button></li>
                ))}
              </ul>
            </div>
          )}

          {!result && (
            <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) lookUp(typed, false); }} className="space-y-2">
              <label htmlFor="scan-input" className="text-xs font-medium text-muted-foreground">Waiting for the reader… or type the chip number</label>
              <Input id="scan-input" ref={inputRef} autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" autoComplete="off" autoCorrect="off" spellCheck={false}
                placeholder="982 000 000 000 000" className="h-12 font-mono text-lg tabular-nums" data-testid="input-scan" />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
                <Button type="submit" disabled={!typed.trim()} data-testid="button-scan-open">Open goat</Button>
              </div>
            </form>
          )}

          <p className="text-xs text-muted-foreground">
            Pair the reader in Bluetooth settings as a keyboard (HID). You can also scan without opening this box, from any page, as long as you aren't typing in a box.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
