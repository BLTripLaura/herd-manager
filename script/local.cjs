// Local test server for the Vercel build (same function + static files)
const http = require("http"), fs = require("fs"), path = require("path");
const fn = require("../.vercel/output/functions/api.func/index.js").default;
const root = path.join(__dirname, "../.vercel/output/static");
http.createServer((req, res) => {
  if (req.url.startsWith("/api")) return fn(req, res);
  let f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, "index.html");
  const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
  res.setHeader("Content-Type", types[path.extname(f)] || "application/octet-stream");
  fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 5077, () => console.log("local on", process.env.PORT || 5077));
