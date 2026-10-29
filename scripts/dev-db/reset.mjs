import { migrate } from "./migrate.mjs";

try {
  await migrate({ reset: true });
  console.log("[reset] done");
} catch (error) {
  console.error(`[reset] ${error.message}`);
  process.exit(1);
}
