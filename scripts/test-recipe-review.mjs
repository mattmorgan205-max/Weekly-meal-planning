import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = "/tmp/weekwise-recipe-review-tests";
const compile = spawnSync(path.join(root, "node_modules", ".bin", "tsc"), ["--ignoreConfig", "--target", "ES2022", "--module", "Node16", "--moduleResolution", "Node16", "--esModuleInterop", "--skipLibCheck", "--strict", "--types", "node", "--outDir", output, "lib/domain.ts", "lib/recipe-review.ts", "tests/recipe-review.test.ts"], { cwd: root, stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const result = spawnSync(process.execPath, ["--test", path.join(output, "tests/recipe-review.test.js")], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
