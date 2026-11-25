import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = mkdtempSync(path.join(tmpdir(), "weekwise-household-sync-"));
try {
  const compile = spawnSync(path.join(root, "node_modules/.bin/tsc"), ["--ignoreConfig", "--target", "ES2022", "--module", "Node16", "--moduleResolution", "Node16", "--esModuleInterop", "--skipLibCheck", "--strict", "--types", "node", "--outDir", output, "lib/household-sync.ts", "tests/household-sync.test.ts"], { cwd: root, stdio: "inherit" });
  process.exitCode = compile.status || spawnSync(process.execPath, ["--test", path.join(output, "tests/household-sync.test.js")], { cwd: root, stdio: "inherit" }).status || 0;
} finally { rmSync(output, { recursive: true, force: true }); }
