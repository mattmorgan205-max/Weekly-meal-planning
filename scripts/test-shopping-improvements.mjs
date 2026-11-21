import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = "/tmp/weekwise-shopping-improvements-tests";
const compile = spawnSync(path.join(projectRoot, "node_modules", ".bin", "tsc"), [
  "--ignoreConfig", "--target", "ES2022", "--module", "Node16", "--moduleResolution", "Node16",
  "--esModuleInterop", "--skipLibCheck", "--strict", "--types", "node", "--noEmit", "false",
  "--outDir", outputDirectory, "lib/domain.ts", "lib/recipe-filters.ts", "tests/shopping-improvements.test.ts"
], { cwd: projectRoot, stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const test = spawnSync(process.execPath, ["--test", path.join(outputDirectory, "tests", "shopping-improvements.test.js")], {
  cwd: projectRoot, stdio: "inherit"
});
process.exit(test.status ?? 1);
