import { app, bootstrap, errorHandler } from "./app.js";
import { tick } from "./jobs.js";
import { existsSync } from "node:fs";
import express from "express";
import { resolve } from "node:path";
bootstrap();
if (process.env.NODE_ENV !== "production") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const dist = resolve("dist");
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: "1h" }));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(dist, "index.html")),
    );
  }
}
app.use(errorHandler);
const port = Number(process.env.PORT) || 4320;
const server = app.listen(port, process.env.HOST || "0.0.0.0", () =>
  console.log(`CloseOS ready on port ${port}`),
);
const interval = setInterval(() => void tick(), 5000);
void tick();
process.on("SIGTERM", () => {
  clearInterval(interval);
  server.close(() => process.exit(0));
});
