import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, RotateCcw, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type SectionId = "stats" | "todo" | "upcoming" | "vaccines" | "holds" | "cabinet" | "recent";
export type LayoutItem = { id: SectionId; side: "left" | "right"; hidden?: boolean };

export const SECTION_LABELS: Record<SectionId, { label: string; hint: string }> = {
  stats: { label: "Herd numbers", hint: "Active animals, in milk, milk holds, kidding soon" },
  todo: { label: "To do today", hint: "Doses due, heat watch, farm tasks" },
  upcoming: { label: "Coming up", hint: "Next 14 days, kidding within 30 days" },
  vaccines: { label: "Annual vaccines", hint: "Yearly CD&T boosters due in the next 30 days" },
  holds: { label: "Withdrawal holds", hint: "Only shows when a goat is on a hold" },
  cabinet: { label: "Medicine cabinet", hint: "On hand and reorder alerts" },
  recent: { label: "Recent treatments", hint: "Last 6 treatments given" },
};

export const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: "stats", side: "left" },
  { id: "todo", side: "left" },
  { id: "upcoming", side: "left" },
  { id: "vaccines", side: "right" },
  { id: "holds", side: "right" },
  { id: "cabinet", side: "right" },
  { id: "recent", side: "right" },
];

const KEY = ["/api/settings/todayLayout"];

// Fill in any sections missing from a saved layout (e.g. new ones added later)
function normalize(v: any): LayoutItem[] {
  const saved: LayoutItem[] = Array.isArray(v) ? v.filter((x) => x && x.id in SECTION_LABELS) : [];
  const ids = new Set(saved.map((x) => x.id));
  return [...saved, ...DEFAULT_LAYOUT.filter((d) => !ids.has(d.id))];
}

export function useTodayLayout() {
  const q = useQuery<{ value: any }>({ queryKey: KEY, staleTime: Infinity });
  const save = useMutation({
    mutationFn: async (value: LayoutItem[] | null) => (await apiRequest("PUT", KEY[0], { value })).json(),
    onSuccess: (d) => queryClient.setQueryData(KEY, d),
  });
  return { layout: normalize(q.data?.value), save, loading: q.isLoading };
}

export function CustomizeTodayDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { layout, save } = useTodayLayout();
  const { toast } = useToast();
  const [items, setItems] = useState<LayoutItem[]>(layout);
  useEffect(() => { if (open) setItems(layout); }, [open]); // eslint-disable-line

  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= items.length) return;
    const next = [...items]; [next[i], next[j]] = [next[j], next[i]]; setItems(next);
  };
  const patch = (i: number, p: Partial<LayoutItem>) => setItems(items.map((x, k) => (k === i ? { ...x, ...p } : x)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Customize Today</DialogTitle>
          <DialogDescription>Put the sections in the order you want, top to bottom. On a computer, choose which column each one sits in.</DialogDescription>
        </DialogHeader>
        <ol className="min-w-0 space-y-2" data-testid="list-layout">
          {items.map((it, i) => {
            const meta = SECTION_LABELS[it.id];
            return (
              <li key={it.id} className={`rounded-md border px-3 py-2.5 ${it.hidden ? "bg-muted/50" : "bg-card"}`} data-testid={`layout-item-${it.id}`}>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${meta.label} up`} data-testid={`button-up-${it.id}`}><ArrowUp /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${meta.label} down`} data-testid={`button-down-${it.id}`}><ArrowDown /></Button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold ${it.hidden ? "text-muted-foreground line-through" : ""}`}>{i + 1}. {meta.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{meta.hint}</div>
                  </div>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    {it.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <Switch checked={!it.hidden} onCheckedChange={(v) => patch(i, { hidden: !v })} aria-label={`Show ${meta.label}`} data-testid={`switch-show-${it.id}`} />
                  </label>
                </div>
                {it.id === "stats" && <div className="mt-1 hidden pl-9 text-xs text-muted-foreground lg:block">On a computer this row spans the full width: at the top, or at the bottom if you move it last.</div>}
                {it.id !== "stats" && (
                  <div className="mt-2 hidden items-center gap-2 pl-9 text-xs text-muted-foreground lg:flex">
                    <span>Column</span>
                    <ToggleGroup type="single" size="sm" variant="outline" value={it.side} onValueChange={(v) => v && patch(i, { side: v as "left" | "right" })}>
                      <ToggleGroupItem value="left" className="h-7 px-2.5 text-xs" data-testid={`toggle-left-${it.id}`}>Wide left</ToggleGroupItem>
                      <ToggleGroupItem value="right" className="h-7 px-2.5 text-xs" data-testid={`toggle-right-${it.id}`}>Narrow right</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setItems(DEFAULT_LAYOUT)} data-testid="button-layout-reset"><RotateCcw />Reset to default</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={async () => { await save.mutateAsync(items); toast({ title: "Today layout saved" }); onOpenChange(false); }} disabled={save.isPending} data-testid="button-layout-save">Save layout</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
