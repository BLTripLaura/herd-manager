import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Presentation, Save, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { post, fmtDate, useList } from "@/lib/herd";
import { errText } from "@/pages/milk";

type Snap = { savedAt: string; goats: number } | null;
export type HerdInfo = { active: "mine" | "demo"; demo: Snap; mine: Snap };
export const useHerdInfo = () => useQuery<HerdInfo>({ queryKey: ["/api/herds"] });

export async function switchHerd(to: "mine" | "demo") {
  const j = await post("/api/herds/switch", { to });
  queryClient.invalidateQueries();
  return j as HerdInfo;
}

/** Thin strip across the top of every page while the demo herd is showing */
export function DemoBanner() {
  const { data } = useHerdInfo();
  const [busy, setBusy] = useState(false);
  if (data?.active !== "demo") return null;
  return (
    <div className="flex items-center justify-center gap-3 bg-amber-100 px-3 py-1.5 text-xs text-amber-950 dark:bg-amber-900/50 dark:text-amber-100" data-testid="banner-demo">
      <Presentation className="h-3.5 w-3.5 shrink-0" />
      <span><b>Demo herd.</b> Changes here aren't kept.</span>
      <Button size="sm" variant="outline" className="h-6 bg-background/70 px-2 text-xs" disabled={busy} data-testid="button-banner-myherd"
        onClick={async () => { setBusy(true); try { await switchHerd("mine"); } finally { setBusy(false); } }}>
        {busy ? <Loader2 className="animate-spin" /> : null}Back to my herd
      </Button>
    </div>
  );
}

export function HerdSwitcher({ onErase, onSample }: { onErase: () => void; onSample: () => void }) {
  const { toast } = useToast();
  const { data: info } = useHerdInfo();
  const { data: animals = [] } = useList("animals");
  const [busy, setBusy] = useState("");
  const [ask, setAsk] = useState<null | "start">(null);
  const run = async (key: string, fn: () => Promise<any>, msg: string) => {
    setBusy(key);
    try { await fn(); queryClient.invalidateQueries(); toast({ title: msg }); }
    catch (e) { toast({ title: "Something went wrong", description: errText(e), variant: "destructive" }); }
    setBusy("");
  };
  const spin = (k: string, icon: any) => (busy === k ? <Loader2 className="animate-spin" /> : icon);
  if (!info) return <div className="h-40 animate-pulse rounded-lg border bg-card" />;
  const demo = info.active === "demo";

  return (
    <div className="rounded-lg border bg-card p-4" data-testid="section-herds">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold"><ArrowLeftRight className="h-4 w-4 text-primary" />My herd and demo herd</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {demo ? <>You're showing the <b>demo herd</b>. Anything you change in the demo is thrown away when you go back to your herd, so it's always the same for the next demo.</>
          : info.demo ? <>You're working in <b>your herd</b> ({animals.length} goats). The demo herd ({info.demo.goats} goats, saved {fmtDate(info.demo.savedAt)}) is stored separately; opening it saves your herd first, and its dates move forward so it always looks current.</>
          : <>The app is showing the sample herd. Save it as your demo, and your own herd starts empty and ready to import.</>}
      </p>
      <div className="flex flex-wrap gap-2">
        {!info.demo && <Button size="sm" onClick={() => setAsk("start")} disabled={!!busy} data-testid="button-start-mine">{spin("start", <Save />)}Save as demo and start my herd</Button>}
        {info.demo && !demo && <Button size="sm" variant="outline" disabled={!!busy} data-testid="button-open-demo" onClick={() => run("demo", () => switchHerd("demo"), "Showing the demo herd")}>{spin("demo", <Presentation />)}Show demo herd</Button>}
        {demo && <>
          <Button size="sm" disabled={!!busy} data-testid="button-back-mine" onClick={() => run("mine", () => switchHerd("mine"), "Back to your herd")}>{spin("mine", <ArrowLeftRight />)}Back to my herd</Button>
          <Button size="sm" variant="outline" disabled={!!busy} data-testid="button-save-demo" onClick={() => run("save", () => post("/api/herds/save-demo"), "Demo herd saved as it is now")}>{spin("save", <Save />)}Keep these changes in the demo</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={onSample} data-testid="button-reset-sample"><RotateCcw />Refresh demo</Button>
        </>}
        {!demo && info.demo && <Button size="sm" variant="destructive" disabled={!!busy} onClick={onErase} data-testid="button-clear-all"><Trash2 />Erase my herd</Button>}
      </div>

      <AlertDialog open={ask === "start"} onOpenChange={(o) => !o && setAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save the sample as your demo herd?</AlertDialogTitle>
            <AlertDialogDescription>The sample herd is saved as the demo, and the app switches to your own herd, empty and ready for import. You can open the demo any time from this page.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-start" onClick={() => { setAsk(null); run("start", () => post("/api/herds/start-mine"), "Demo saved. Your herd is ready to import."); }}>Save and start</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
