import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env")) {
  console.log(".env déjà présent, configuration conservée.");
  process.exit(0);
}
const password = randomBytes(18).toString("base64url");
const email = process.env.CLOSEOS_ADMIN_EMAIL || "admin@closeos.local";
writeFileSync(
  ".env",
  `PORT=4320\nHOST=127.0.0.1\nPUBLIC_URL=http://localhost:4320\nDATABASE_PATH=./data/closeos.sqlite\nENCRYPTION_KEY=${randomBytes(48).toString("base64url")}\nADMIN_EMAIL=${email}\nADMIN_NAME=Gauthier\nADMIN_PASSWORD=${password}\nWORKSPACE_NAME=Mon espace\n`,
  { mode: 0o600 },
);
writeFileSync(
  ".local-access.txt",
  `CloseOS\nEmail : ${email}\nMot de passe initial : ${password}\nLocal : http://localhost:4320\nProduction : https://call.bizos.cc\nChangez le mot de passe dans Paramètres → Profil.\n`,
  { mode: 0o600 },
);
console.log(
  "Configuration créée. Identifiants dans .local-access.txt (privé, ignoré par Git).",
);
