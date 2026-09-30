/* Vercel entry: the same Express app, served as one function for every /api request */
import express from "express";
import compression from "compression";
import { createServer } from "node:http";
import { registerRoutes } from "./routes";

const app = express();
app.set("trust proxy", true);
app.use(compression());
app.use((_req, res, next) => { res.setHeader("X-Robots-Tag", "noindex, nofollow"); res.setHeader("Cache-Control", "no-store"); next(); });
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: false, limit: "25mb" }));

const ready = registerRoutes(createServer(app), app).then(() => {
  app.use((err: any, _req: any, res: any, next: any) => {
    console.error("Server error:", err);
    if (res.headersSent) return next(err);
    res.status(err.status || err.statusCode || 500).json({ message: "Something went wrong on the server. Please try again." });
  });
});

export default async function handler(req: any, res: any) {
  await ready;
  return app(req, res);
}
