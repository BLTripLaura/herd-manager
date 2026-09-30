// Builds the Vercel version: static app + one server function, in Vercel's prebuilt output format
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, mkdir, cp, writeFile } from "node:fs/promises";

const OUT = ".vercel/output";
await rm(OUT, { recursive: true, force: true });
await rm("dist", { recursive: true, force: true });
await viteBuild();
await mkdir(`${OUT}/functions/api.func`, { recursive: true });
await cp("dist/public", `${OUT}/static`, { recursive: true });
await esbuild({
  entryPoints: ["server/vercel.ts"], platform: "node", target: "node20", bundle: true, format: "cjs",
  outfile: `${OUT}/functions/api.func/index.js`, minify: true, sourcemap: false, logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"' },
  external: ["better-sqlite3", "pg-native", "bufferutil", "utf-8-validate", "lightningcss", "vite", "@vitejs/*", "@babel/*"],
});
await writeFile(`${OUT}/functions/api.func/package.json`, JSON.stringify({ type: "commonjs" }));
await writeFile(`${OUT}/functions/api.func/.vc-config.json`, JSON.stringify({ runtime: "nodejs22.x", handler: "index.js", launcherType: "Nodejs", shouldAddHelpers: true, maxDuration: 60, regions: ["iad1"] }, null, 2));
await writeFile(`${OUT}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: "/api/(.*)", dest: "/api" },
    { src: "/(.*)", headers: { "Strict-Transport-Security": "max-age=63072000", "X-Robots-Tag": "noindex, nofollow", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" }, continue: true },
    { src: "/(index\\.html)?", headers: { "Cache-Control": "no-cache" }, continue: true },
    { handle: "filesystem" },
    { src: "/(.*)", dest: "/index.html" },
  ],
  crons: [{ path: "/api/cron/backup", schedule: "0 6 * * *" }],
}, null, 2));
console.log("built", OUT);
