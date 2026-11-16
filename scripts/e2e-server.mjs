import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
const dir = mkdtempSync(join(tmpdir(), "closeos-e2e-"));
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: "4322",
    PUBLIC_URL: "http://127.0.0.1:4322",
    DATABASE_PATH: join(dir, "db.sqlite"),
    ENCRYPTION_KEY: "e2e-isolated-test-encryption-key-long-enough",
    ADMIN_EMAIL: "test@closeos.local",
    ADMIN_PASSWORD: "E2E_Test_Password_12345",
    ADMIN_NAME: "Gauthier",
    WORKSPACE_NAME: "Studio Test",
  },
});
const server = http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://localhost:4323");
    const slug = (u.searchParams.get("event") || "").replace(/[^a-z0-9-]/g, "");
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<!doctype html><html><head><title>Site externe · Test embed CloseOS</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font:16px system-ui;margin:20px"><h1>Notre accompagnement</h1><button data-closeos-popup="${slug}">Prendre rendez-vous</button><div data-closeos-inline="${slug}" style="max-width:920px;min-height:700px"></div><script>window.dataLayer=[];window.closeosEvents=[];['lead_captured','qualified','booked'].forEach(n=>window.addEventListener('closeos.'+n,e=>closeosEvents.push(e.detail)));</script><script src="http://127.0.0.1:4322/embed.js" async></script></body></html>`,
    );
  })
  .listen(4323, "127.0.0.1");
const stop = () => {
  child.kill();
  server.close();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", (code) => {
  server.close();
  process.exit(code || 0);
});
