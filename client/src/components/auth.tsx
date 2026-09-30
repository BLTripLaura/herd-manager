import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, LogOut, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Logo } from "@/components/shell";
import { useFarm, appTitle, FARM_KEY } from "@/lib/farm";

/** Shared logins show as their username */
export const showLogin = (email: string) => email.endsWith("@login.herd.app") ? email.split("@")[0] : email;
export type Me = { email: string; name: string | null; role: "owner" | "helper"; mustChange?: boolean };
const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx);

async function send(url: string, body?: any, method = "POST") {
  let r: Response;
  try {
    r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new Error("Couldn't reach the herd app. Check your signal or Wi-Fi, then close this page and open the herd app again.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || "Something went wrong. Try again.");
  return j;
}
export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  queryClient.clear();
  location.hash = "#/";
  location.reload();
}

function Card({ children }: { children: ReactNode }) {
  const farm = useFarm().data?.farmName || "";
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <Logo className="h-20 w-20" />
          <div className="text-base font-bold">{appTitle(farm)}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await send("/api/auth/login", { email, password }); onDone(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Card>
      <form onSubmit={go} className="space-y-3">
        <div className="space-y-1"><Label htmlFor="email">Email or username</Label><Input id="email" type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-email" /></div>
        <div className="space-y-1"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="input-password" /></div>
        {err && <p className="text-sm text-destructive" data-testid="text-login-error">{err}</p>}
        <Button type="submit" className="w-full" disabled={busy} data-testid="button-sign-in">{busy ? "Signing in…" : "Sign in"}</Button>
        <p className="text-center text-xs text-muted-foreground">Forgot your password? Ask the herd owner to give you a new one.</p>
      </form>
    </Card>
  );
}

export function PasswordForm({ onDone, first }: { onDone: () => void; first?: boolean }) {
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e: FormEvent) => {
    e.preventDefault(); setErr("");
    if (a.length < 8) return setErr("Use at least 8 characters.");
    if (a !== b) return setErr("The two passwords don't match.");
    setBusy(true);
    try { await send("/api/me/password", { password: a }); onDone(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={go} className="space-y-3">
      {first && <p className="text-sm text-muted-foreground">Welcome. Choose your own password to replace the temporary one.</p>}
      <div className="space-y-1"><Label htmlFor="np">New password</Label><Input id="np" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} data-testid="input-new-password" /></div>
      <div className="space-y-1"><Label htmlFor="np2">Type it again</Label><Input id="np2" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} data-testid="input-new-password-2" /></div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="submit" className="w-full" disabled={busy} data-testid="button-save-password">{busy ? "Saving…" : "Save password"}</Button>
    </form>
  );
}

/** A new copy that hasn't been given its Supabase settings in Vercel yet */
function MissingSettings({ missing }: { missing: string[] }) {
  return (
    <div className="space-y-2 text-sm" data-testid="card-missing-settings">
      <p className="font-semibold">Almost there: this copy needs its settings.</p>
      <p className="text-muted-foreground">In Vercel, open this project, go to Settings, then Environment Variables, and add:</p>
      <ul className="list-disc pl-5 font-mono text-xs">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
      <p className="text-muted-foreground">Then redeploy the project and open this page again. The setup guide has each step.</p>
    </div>
  );
}

/** Brand-new copy: the first person makes the owner login and names the farm */
function FirstSetup({ onDone }: { onDone: () => void }) {
  const [farmName, setFarmName] = useState(""); const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e: FormEvent) => {
    e.preventDefault(); setErr("");
    if (a.length < 8) return setErr("Use a password of at least 8 characters.");
    if (a !== b) return setErr("The two passwords don't match.");
    setBusy(true);
    try { await send("/api/auth/setup", { farmName, name, email, password: a }); await queryClient.invalidateQueries({ queryKey: FARM_KEY }); onDone(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={go} className="space-y-3" data-testid="form-first-setup">
      <p className="text-sm text-muted-foreground">Welcome. Set up your herd app. You'll be the owner, and you can add helpers or a barn tablet login later. The Medicine Cabinet is already stocked with common goat medicines for you to check with your vet.</p>
      <div className="space-y-1"><Label htmlFor="farm">Farm name</Label><Input id="farm" value={farmName} onChange={(e) => setFarmName(e.target.value)} required placeholder="Sunny Acres Dairy Goats" data-testid="input-farm-name" /></div>
      <div className="space-y-1"><Label htmlFor="nm">Your name</Label><Input id="nm" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-owner-name" /></div>
      <div className="space-y-1"><Label htmlFor="em">Your email</Label><Input id="em" type="email" autoCapitalize="none" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-owner-email" /></div>
      <div className="space-y-1"><Label htmlFor="p1">Password</Label><Input id="p1" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} data-testid="input-owner-password" /></div>
      <div className="space-y-1"><Label htmlFor="p2">Type it again</Label><Input id="p2" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} data-testid="input-owner-password-2" /></div>
      {err && <p className="text-sm text-destructive" data-testid="text-setup-error">{err}</p>}
      <Button type="submit" className="w-full" disabled={busy} data-testid="button-finish-setup">{busy ? "Setting up…" : "Set up my herd"}</Button>
    </form>
  );
}

/** Owner only: change the farm name shown in the app */
export function FarmNameCard() {
  const me = useMe();
  const farm = useFarm();
  const { toast } = useToast();
  const [v, setV] = useState<string | null>(null);
  if (me?.role !== "owner") return null;
  const val = v ?? farm.data?.farmName ?? "";
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try { await send("/api/farm", { farmName: val }, "PUT"); await queryClient.invalidateQueries({ queryKey: FARM_KEY }); setV(null); toast({ title: "Farm name saved" }); } catch (x: any) { toast({ title: x.message, variant: "destructive" }); }
  };
  return (
    <form onSubmit={save} className="rounded-lg border bg-card p-4" data-testid="card-farm-name">
      <h2 className="mb-1 text-sm font-bold">Farm name</h2>
      <p className="mb-3 text-sm text-muted-foreground">Shown at the top of the app, on the sign-in screen and on printed reports.</p>
      <div className="flex gap-2"><Input className="h-9" value={val} onChange={(e) => setV(e.target.value)} data-testid="input-farm-name-edit" /><Button type="submit" size="sm" className="h-9">Save</Button></div>
    </form>
  );
}

/** Shows first-time setup (brand-new copy) or the sign-in screen until someone on the herd list signs in */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = useQuery<Me | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => { const r = await fetch("/api/auth/me"); return r.ok ? r.json() : null; },
  });
  const farm = useFarm();
  if (isLoading || farm.isLoading) return <div className="flex min-h-dvh items-center justify-center"><Logo className="h-16 w-16 animate-pulse" /></div>;
  if (farm.error) return <Card><p className="text-sm text-destructive" data-testid="text-setup-error">{(farm.error as Error).message}</p><Button className="mt-4 w-full" onClick={() => farm.refetch()}>Try again</Button></Card>;
  if (farm.data?.missing?.length) return <Card><MissingSettings missing={farm.data.missing} /></Card>;
  if (farm.data?.setupNeeded && !data) return <Card><FirstSetup onDone={() => { queryClient.clear(); refetch(); }} /></Card>;
  if (!data) return <SignIn onDone={() => { queryClient.clear(); refetch(); }} />;
  if (data.mustChange) return <Card><PasswordForm first onDone={() => refetch()} /></Card>;
  return <MeCtx.Provider value={data}>{children}</MeCtx.Provider>;
}

/** Name, change password and sign out (bottom of the menu) */
export function AccountBox() {
  const me = useMe();
  const [pw, setPw] = useState(false);
  const { toast } = useToast();
  if (!me) return null;
  return (
    <div className="space-y-1 border-t pt-3">
      <div className="truncate px-1 text-xs text-muted-foreground" title={me.email}>{me.name || showLogin(me.email)}{me.role === "owner" ? " (owner)" : ""}</div>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setPw(true)} data-testid="button-change-password"><KeyRound className="h-3.5 w-3.5" />Password</Button>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={signOut} data-testid="button-sign-out"><LogOut className="h-3.5 w-3.5" />Sign out</Button>
      </div>
      <AlertDialog open={pw} onOpenChange={setPw}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Change your password</AlertDialogTitle></AlertDialogHeader>
          <PasswordForm onDone={() => { setPw(false); toast({ title: "Password changed" }); }} />
          <AlertDialogFooter><AlertDialogCancel>Close</AlertDialogCancel></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type Person = { email: string; name: string | null; role: string };
/** Owner only: who can sign in */
export function LoginsCard() {
  const me = useMe();
  const { toast } = useToast();
  const { data = [], refetch } = useQuery<Person[]>({ queryKey: ["/api/users"], enabled: me?.role === "owner" });
  const [email, setEmail] = useState(""); const [name, setName] = useState("");
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const [remove, setRemove] = useState<Person | null>(null);
  if (me?.role !== "owner") return null;
  const add = async (e?: FormEvent, who?: Person) => {
    e?.preventDefault();
    try {
      const r = await send("/api/users", who ? { email: who.email, name: who.name } : { email, name });
      setShown({ email: r.email, password: r.password }); setEmail(""); setName(""); refetch();
    } catch (x: any) { toast({ title: x.message, variant: "destructive" }); }
  };
  return (
    <div className="rounded-lg border bg-card p-4" data-testid="card-logins">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4 text-primary" />Who can sign in</h2>
      <p className="mb-3 text-sm text-muted-foreground">Add a farm helper by email, or a shared login (like the barn tablet) with just a username. You'll get a temporary password to give them; they choose their own the first time they sign in. Helpers can see and change all records.</p>
      <ul className="mb-3 divide-y rounded-md border text-sm">
        {data.map((p) => (
          <li key={p.email} className="flex items-center justify-between gap-2 px-3 py-2" data-testid={`row-login-${p.email}`}>
            <span className="min-w-0 truncate">{p.name ? `${p.name} · ` : ""}<span className="text-muted-foreground">{showLogin(p.email)}</span>{p.role === "owner" && <span className="ml-1 text-xs text-primary">owner</span>}</span>
            {p.role !== "owner" && (
              <span className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => add(undefined, p)}>New password</Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${p.email}`} onClick={() => setRemove(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <Input className="h-9 min-w-0 flex-1 basis-40" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-helper-name" />
        <Input className="h-9 min-w-0 flex-[2] basis-56" type="text" autoCapitalize="none" placeholder="Email or username" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-helper-email" />
        <Button type="submit" size="sm" className="h-9" data-testid="button-add-helper"><UserPlus />Add helper</Button>
      </form>

      <AlertDialog open={!!shown} onOpenChange={(o) => !o && setShown(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Temporary password</AlertDialogTitle>
            <AlertDialogDescription>Give this to {shown ? showLogin(shown.email) : ""}. It's shown only once. They'll pick their own password when they first sign in.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border bg-muted px-3 py-2 text-center font-mono text-base" data-testid="text-temp-password">{shown?.password}</div>
          <AlertDialogFooter><AlertDialogAction>Done</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {remove?.name || remove?.email}?</AlertDialogTitle>
            <AlertDialogDescription>They won't be able to sign in any more. Records they entered stay.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { try { await send(`/api/users/${encodeURIComponent(remove!.email)}`, undefined, "DELETE"); refetch(); } catch (x: any) { toast({ title: x.message, variant: "destructive" }); } setRemove(null); }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
