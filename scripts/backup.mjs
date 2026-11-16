import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const db = new DatabaseSync(
  process.env.DATABASE_PATH || "./data/closeos.sqlite",
);
mkdirSync("./backups", { recursive: true });
const file = resolve(
  "./backups/closeos-" +
    new Date().toISOString().replaceAll(":", "-") +
    ".sqlite",
);
db.prepare("VACUUM INTO ?").run(file);
db.close();
console.log("Sauvegarde cohérente créée : " + file);
