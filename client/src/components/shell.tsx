import { DemoBanner } from "@/components/herd-switcher";
import { UpdateBanner } from "@/components/update-banner";
import { useFarmName, appTitle } from "@/lib/farm";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Sun, Moon, Sunrise, List, Layers, Pill, Heart, Trees, Milk as MilkIcon, Database, Menu, Snowflake, FileBarChart, ChevronRight, ClipboardList, Phone, ScrollText, BookOpen, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { QuickSearch } from "@/components/quick-search";
import { AccountBox, useMe } from "@/components/auth";

/* ---------- shared app state: theme + batch selection ---------- */
type Ctx = { dark: boolean; setDark: (v: boolean) => void; selected: number[]; setSelected: (ids: number[]) => void; herdQ: string; setHerdQ: (q: string) => void; reportAsk: ReportAsk | null; setReportAsk: (a: ReportAsk | null) => void; careJob: CareJob | null; setCareJob: (j: CareJob | null) => void };
/** A care job handed to Batch entry (e.g. from a Today task): which job, and the task to tick off when saved */
export type CareJob = { kind: string; taskId?: number };
export type ReportAsk = { report: string; from: string; to: string; q: string };
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [selected, setSelected] = useState<number[]>([]);
  const [herdQ, setHerdQ] = useState("");
  const [reportAsk, setReportAsk] = useState<ReportAsk | null>(null);
  const [careJob, setCareJob] = useState<CareJob | null>(null);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  return <AppCtx.Provider value={{ dark, setDark, selected, setSelected, herdQ, setHerdQ, reportAsk, setReportAsk, careJob, setCareJob }}>{children}</AppCtx.Provider>;
}

/** Plain goat-head mark (each farm's own copy of the app) */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Herd Manager" className={`text-primary ${className ?? ""}`} data-testid="img-logo" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="32" r="30" fill="currentColor" opacity="0.1" stroke="none" />
      <path d="M24 17c-4-6-10-7-13-5 3 1 6 4 8 9M40 17c4-6 10-7 13-5-3 1-6 4-8 9" />
      <path d="M21 24l-9 3c1 3 4 5 8 5M43 24l9 3c-1 3-4 5-8 5" />
      <path d="M22 22c2-3 6-4 10-4s8 1 10 4c1 6 0 13-3 19-2 4-4 6-7 6s-5-2-7-6c-3-6-4-13-3-19z" />
      <path d="M28 51c1 4 3 6 4 6s3-2 4-6" />
      <circle cx="26.5" cy="30" r="1.2" fill="currentColor" /><circle cx="37.5" cy="30" r="1.2" fill="currentColor" />
    </svg>
  );
}

const NAV = [
  { href: "/", label: "Today", icon: Sunrise, mobile: true },
  { href: "/herd", label: "Herd", icon: List, mobile: true },
  { href: "/batch", label: "Batch entry", short: "Batch", icon: Layers, mobile: true },
  { href: "/meds", label: "Medications", short: "Meds", icon: Pill, mobile: true },
  { href: "/pastures", label: "Pastures", short: "Pasture", icon: Trees, mobile: true },
  { href: "/breeding", label: "Breeding", short: "Breed", icon: Heart, mobile: true },
  { href: "/breeding/plan", label: "Breeding plan", short: "Plan", icon: ClipboardList, mobile: true },
  { href: "/tank", label: "Tank inventory", icon: Snowflake, mobile: false },
  { href: "/milk", label: "Milk test", icon: MilkIcon, mobile: false },
  { href: "/phones", label: "Phone numbers", short: "Phones", icon: Phone, mobile: true },
  { href: "/reports", label: "Reports", icon: FileBarChart, mobile: false },
  { href: "/reference", label: "Reference docs", short: "Reference", icon: BookOpen, mobile: false },
  { href: "/sale-docs", label: "Sale docs", short: "Sale docs", icon: FileSignature, mobile: false },
  { href: "/data", label: "Import & export", icon: Database, mobile: false },
  { href: "/log", label: "System log", icon: ScrollText, mobile: false, owner: true },
];
/** Menu items this person can use (the system log is Laura's) */
const useNav = () => { const me = useMe(); return NAV.filter((n) => !(n as any).owner || me?.role === "owner"); };

function isActive(loc: string, href: string) {
  if (href === "/breeding") return loc === "/breeding"; // the plan has its own tab
  return href === "/" ? loc === "/" : loc.startsWith(href) || (href === "/herd" && loc.startsWith("/animal"));
}

function ThemeToggle() {
  const { dark, setDark } = useApp();
  return (
    <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} aria-label="Toggle dark mode" data-testid="button-theme">
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function NavLinks({ onNav }: { onNav?: () => void }) {
  const [loc] = useLocation();
  const nav = useNav();
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((n) => (
        <Link key={n.href} href={n.href} onClick={onNav}
          data-testid={`link-nav-${n.label.toLowerCase().replace(/\W+/g, "-")}`}
          className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover-elevate",
            isActive(loc, n.href) ? "bg-sidebar-accent text-foreground" : "text-muted-foreground")}>
          <n.icon className="h-4 w-4" />
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const nav = useNav();
  const farm = useFarmName();
  useEffect(() => { document.title = appTitle(farm); }, [farm]);
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-1">
          <Logo className="h-12 w-12 shrink-0" />
          <div className="leading-tight">
            <div className="truncate text-sm font-bold">{farm || "Herd Manager"}</div>
            {farm && <div className="text-xs text-muted-foreground">Herd Manager</div>}
          </div>
        </div>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1"><NavLinks /></div>
        <div className="mt-3 space-y-2">
          <AccountBox />
          <div className="flex justify-end"><ThemeToggle /></div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-4 py-2 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <Logo className="h-9 w-9 shrink-0" />
          <span className="truncate text-sm font-bold">{appTitle(farm)}</span>
        </div>
        <div className="flex items-center">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Menu" data-testid="button-menu"><Menu /></Button>
        </div>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-64 overflow-y-auto bg-sidebar p-4">
          <SheetTitle className="mb-4 text-sm">Menu</SheetTitle>
          <NavLinks onNav={() => setOpen(false)} />
          <div className="mt-4"><AccountBox /></div>
        </SheetContent>
      </Sheet>

      <main className="pb-24 md:pb-10 md:pl-60">
        <div className="sticky top-[49px] z-20 border-b bg-background/95 backdrop-blur md:top-0 print:hidden">
          <UpdateBanner />
          <DemoBanner />
          <div className="mx-auto max-w-6xl px-4 py-2 md:px-8 md:py-3"><QuickSearch /></div>
        </div>
        <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-6">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-8 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {nav.filter((n) => n.mobile).map((n) => (
          <Link key={n.href} href={n.href} data-testid={`link-tab-${n.label.toLowerCase().replace(/\W+/g, "-")}`}
            className={cn("flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-2 text-[10px] font-medium leading-tight sm:text-[11px]",
              isActive(loc, n.href) ? "text-primary" : "text-muted-foreground")}>
            <n.icon className="h-5 w-5" />
            <span className="w-full truncate text-center">{n.short ?? n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: any; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
      <Icon className="mb-3 h-8 w-8 text-muted-foreground" />
      <div className="text-sm font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warn"; href?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">{label}{href && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />}</div>
      <div className="mt-1 text-xl font-bold tabular-nums" data-testid={`text-stat-${label.toLowerCase().replace(/\W+/g, "-")}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </>
  );
  const cls = cn("rounded-lg border bg-card p-4", tone === "warn" && "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40");
  if (!href) return <div className={cls}>{body}</div>;
  return <Link href={href} className={cn(cls, "group block hover-elevate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")} data-testid={`link-stat-${label.toLowerCase().replace(/\W+/g, "-")}`}>{body}</Link>;
}
