import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The build this page is running (the hashed main script) */
const current = () => (document.querySelector('script[type="module"][src*="assets/index-"]') as HTMLScriptElement | null)?.getAttribute("src")?.split("/").pop() ?? null;

/** Tablets and home-screen apps can sit on an old copy for days: check for a newer build and offer a one-tap reload */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const mine = current();
    if (!mine) return;
    const check = async () => {
      try {
        const html = await (await fetch(`./index.html?v=${Date.now()}`, { cache: "no-store" })).text();
        const live = /assets\/(index-[^"']+\.js)/.exec(html)?.[1];
        if (live && live !== mine) setReady(true);
      } catch { /* offline: try again later */ }
    };
    check();
    const t = setInterval(check, 5 * 60 * 1000);
    const vis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, []);
  if (!ready) return null;
  return (
    <div className="flex items-center justify-between gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground" data-testid="banner-update">
      <span>A new version of the app is ready.</span>
      <Button size="sm" variant="secondary" onClick={() => location.reload()} data-testid="button-update-reload"><RefreshCw />Update</Button>
    </div>
  );
}
