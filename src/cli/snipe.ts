import { runSnipe } from "../snipe/runSnipe.js";
import { log } from "../util.js";

log("info", "Démarrage du snipe (Chromium va s'ouvrir)…");

runSnipe().catch((err) => {
  log("error", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
