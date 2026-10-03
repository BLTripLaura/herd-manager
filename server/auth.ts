/* Logins. People sign in with Supabase (email + password). The server checks the address is on the
   herd list (herd.app_users), then keeps them signed in for 30 days with its own signed cookie.
   The first person to open a brand-new copy sets it up and becomes the owner.
   Other logins are created by the owner in the app (a temporary password the person changes on first sign-in).
   Removing someone locks them out on their next click. */
import type { Express, Request, Response, NextFunction } from "express";
import { SignJWT, jwtVerify } from "jose";
import { all, get, run, tx } from "./db";
import { ensureSetup } from "./bootstrap";
import { auditLogin, registerAuditWriter } from "./audit";

const COOKIE = "gj_session";
const DAYS = 30;
/** Signing key: the SESSION_SECRET setting if given, otherwise a random one made on first start and kept in the database */
let keyP: Promise<Uint8Array> | null = null;
const secret = () => {
  const env = process.env.SESSION_SECRET;
  if (env && env.length >= 24) return Promise.resolve(new TextEncoder().encode(env));
  if (!keyP) keyP = (async () => {
    await ensureSetup();
    const row = await get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'sessionSecret'");
    if (row) return new TextEncoder().encode(JSON.parse(row.value));
    const k = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, "0")).join("");
    await run("INSERT INTO app_settings (key, value) VALUES ('sessionSecret', ?) ON CONFLICT (key) DO NOTHING", JSON.stringify(k));
    const again = await get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'sessionSecret'");
    return new TextEncoder().encode(JSON.parse(again!.value));
  })().catch((e) => { keyP = null; throw e; });
  return keyP;
};
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";

export type AppUser = { email: string; name: string | null; role: "owner" | "helper"; mustChange?: boolean };
declare global { namespace Express { interface Request { user?: AppUser } } }

const norm = (e: any) => String(e ?? "").trim().toLowerCase();
/** Shared logins (like the barn tablet) use a plain username; it's stored as <name>@login.herd.app */
export const USER_DOMAIN = "login.herd.app";
const toLogin = (v: any) => { const x = norm(v); return x && !x.includes("@") ? `${x.replace(/[^a-z0-9._-]/g, "")}@${USER_DOMAIN}` : x; };
async function member(email: string) {
  return (await get<AppUser>("SELECT email, name, role, must_change AS \"mustChange\" FROM app_users WHERE email = ?", norm(email))) ?? null;
}

function readCookie(req: Request, name: string) {
  const h = req.headers.cookie || "";
  for (const part of h.split(";")) { const [k, ...v] = part.trim().split("="); if (k === name) return decodeURIComponent(v.join("=")); }
  return null;
}
function setCookie(res: Response, value: string, maxAge: number) {
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}

/** Who is signed in, if anyone (still on the list) */
async function currentUser(req: Request): Promise<AppUser | null> {
  const tok = readCookie(req, COOKIE);
  if (!tok) return null;
  try {
    const { payload } = await jwtVerify(tok, await secret(), { algorithms: ["HS256"] });
    return await member(String(payload.sub));
  } catch { return null; }
}

/** The weekly emailed backup signs in with a private key instead of a login */
const backupKeyOk = (req: Request) => {
  const k = process.env.BACKUP_TOKEN;
  return !!k && k.length >= 24 && req.headers.authorization === `Bearer ${k}`;
};

export function registerAuth(app: Express) {
  app.get("/api/auth/config", (_req, res) => res.json({ url: SUPABASE_URL, key: SUPABASE_KEY }));

  // Farm name for the sign-in screen, and whether this copy still needs its first owner
  const missing = () => ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"].filter((k) => !process.env[k]);
  app.get("/api/auth/farm", async (_req, res) => {
    const miss = missing();
    if (miss.length) return res.json({ farmName: "", setupNeeded: false, missing: miss });
    try {
      await ensureSetup();
      const owner = await get("SELECT email FROM app_users WHERE role = 'owner' LIMIT 1");
      const f = await get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'farmName'");
      res.json({ farmName: f ? JSON.parse(f.value) : "", setupNeeded: !owner, missing: [] });
    } catch (e: any) {
      console.error("setup check failed", e);
      res.status(500).json({ message: `The app couldn't reach its database. Check the DATABASE_URL setting in Vercel. (${String(e?.message || e).slice(0, 160)})` });
    }
  });

  // First-time setup: only works while the copy has no owner yet
  app.post("/api/auth/setup", async (req, res) => {
    if (missing().length) return res.status(400).json({ message: "This copy is missing its settings in Vercel." });
    await ensureSetup();
    const farmName = String(req.body?.farmName || "").trim().slice(0, 60);
    const name = String(req.body?.name || "").trim().slice(0, 60) || null;
    const email = norm(req.body?.email), password = String(req.body?.password || "");
    if (!farmName) return res.status(400).json({ message: "Enter your farm name." });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ message: "Enter your email address." });
    if (password.length < 8) return res.status(400).json({ message: "Use a password of at least 8 characters." });
    try {
      await tx(async () => {
        await run("LOCK TABLE app_users IN EXCLUSIVE MODE");
        if (await get("SELECT email FROM app_users WHERE role = 'owner' LIMIT 1")) { const e: any = new Error("taken"); e.taken = true; throw e; }
        await run("INSERT INTO app_users (email, name, role, must_change) VALUES (?, ?, 'owner', false)", email, name);
        await run("SELECT herd.set_login(?, ?)", email, password);
        await run("INSERT INTO app_settings (key, value) VALUES ('farmName', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(farmName));
      });
    } catch (e: any) {
      if (e?.taken) return res.status(409).json({ message: "This herd app is already set up. Sign in instead." });
      throw e;
    }
    const jwt = await new SignJWT({ role: "owner" }).setProtectedHeader({ alg: "HS256" }).setSubject(email).setIssuedAt().setExpirationTime(`${DAYS}d`).sign(await secret());
    setCookie(res, jwt, DAYS * 86400);
    res.json({ email, name, role: "owner", mustChange: false });
  });

  // Sign in: Supabase checks the password; the address must also be on the herd list
  app.post("/api/auth/login", async (req, res) => {
    const email = toLogin(req.body?.email), password = String(req.body?.password || "");
    if (!email || !password) return res.status(400).json({ message: "Enter your email or username and password." });
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (r.status === 429) return res.status(429).json({ message: "Too many tries. Wait a few minutes and try again." });
    if (!r.ok) { await auditLogin(email, false); return res.status(401).json({ message: "That sign-in and password don't match." }); }
    const m = await member(email);
    if (!m) await auditLogin(email, false);
    if (!m) return res.status(403).json({ message: `${email} isn't on this herd's list. Ask the owner to add you.` });
    const jwt = await new SignJWT({ role: m.role }).setProtectedHeader({ alg: "HS256" }).setSubject(m.email).setIssuedAt().setExpirationTime(`${DAYS}d`).sign(await secret());
    setCookie(res, jwt, DAYS * 86400);
    await auditLogin(m.email, true, m.name, m.role);
    res.json(m);
  });
  app.post("/api/auth/logout", (_req, res) => { setCookie(res, "", 0); res.json({ ok: true }); });
  app.get("/api/auth/me", async (req, res) => {
    const u = await currentUser(req);
    if (!u) return res.status(401).json({ message: "Not signed in" });
    res.json(u);
  });

  // Everything else under /api needs a signed-in person (scheduled jobs use their own key)
  app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/auth/") || req.path.startsWith("/cron/")) return next();
    if (req.method === "GET" && req.path === "/backups/excel" && backupKeyOk(req)) { req.user = { email: "backup", name: "Weekly backup", role: "helper" }; return next(); }
    const u = await currentUser(req);
    if (!u) return res.status(401).json({ message: "Please sign in." });
    req.user = u;
    next();
  });
  registerAuditWriter(app);

  // Who can sign in (owner only)
  const ownerOnly = (req: Request, res: Response, next: NextFunction) => (req.user?.role === "owner" ? next() : res.status(403).json({ message: "Only the owner can do that." }));
  // First sign-in with a temporary password: the app asks for a new one, then this clears the reminder
  app.post("/api/me/password", async (req, res) => {
    const password = String(req.body?.password || "");
    if (password.length < 8) return res.status(400).json({ message: "Use at least 8 characters." });
    await run("SELECT herd.set_login(?, ?)", req.user!.email, password);
    await run("UPDATE app_users SET must_change = false WHERE email = ?", req.user!.email);
    res.json({ ok: true });
  });

  app.put("/api/farm", ownerOnly, async (req, res) => {
    const farmName = String(req.body?.farmName || "").trim().slice(0, 60);
    if (!farmName) return res.status(400).json({ message: "Enter your farm name." });
    await run("INSERT INTO app_settings (key, value) VALUES ('farmName', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(farmName));
    res.json({ farmName });
  });
  app.get("/api/users", ownerOnly, async (_req, res) => res.json(await all("SELECT email, name, role, added_at AS \"addedAt\" FROM app_users ORDER BY role DESC, name, email")));
  const tempPassword = () => { const w = "barn goat milk hay kid doe buck pasture clover oats fence gate".split(" "); const r = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n; return `${w[r(w.length)]}-${w[r(w.length)]}-${w[r(w.length)]}-${1000 + r(9000)}`; };
  // Add a helper (or give someone a new temporary password). The temporary password is shown to the owner once.
  app.post("/api/users", ownerOnly, async (req, res) => {
    const email = toLogin(req.body?.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ message: "Enter an email address or a username." });
    const existing = await member(email);
    if (existing?.role === "owner" && email !== req.user!.email) return res.status(400).json({ message: "That's the owner login." });
    const name = String(req.body?.name || "").trim() || existing?.name || null;
    await run("INSERT INTO app_users (email, name, role, must_change) VALUES (?, ?, 'helper', true) ON CONFLICT(email) DO UPDATE SET name = excluded.name, must_change = true", email, name);
    const password = tempPassword();
    await run("SELECT herd.set_login(?, ?)", email, password);
    res.json({ email, name, password });
  });
  app.delete("/api/users/:email", ownerOnly, async (req, res) => {
    const email = toLogin(req.params.email);
    if (email === req.user!.email) return res.status(400).json({ message: "You can't remove yourself." });
    const m = await member(email);
    if (!m || m.role === "owner") return res.status(400).json({ message: "Not a helper." });
    await run("SELECT herd.remove_login(?)", email);
    await run("DELETE FROM app_users WHERE email = ? AND role <> 'owner'", email);
    res.json({ ok: true });
  });
  return { ownerOnly };
}
