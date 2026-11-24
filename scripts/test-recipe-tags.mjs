import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = "/tmp/weekwise-recipe-tags-tests";
const compile = spawnSync(path.join(root, "node_modules", ".bin", "tsc"), [
  "--ignoreConfig", "--target", "ES2022", "--module", "Node16", "--moduleResolution", "Node16",
  "--esModuleInterop", "--skipLibCheck", "--strict", "--types", "node", "--noEmit", "false",
  "--outDir", output, "tests/recipe-tags.test.ts"
], { cwd: root, stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const result = spawnSync(process.execPath, ["--test", path.join(output, "tests", "recipe-tags.test.js")], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
