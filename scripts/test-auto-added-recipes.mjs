import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiler = path.join(projectRoot, "node_modules", ".bin", "tsc");
const outputDirectory = "/tmp/weekwise-auto-recipe-tests";

const compile = spawnSync(
  compiler,
  [
    "--ignoreConfig",
    "--target", "ES2022",
    "--module", "Node16",
    "--moduleResolution", "Node16",
    "--esModuleInterop",
    "--skipLibCheck",
    "--strict",
    "--types", "node",
    "--noEmit", "false",
    "--outDir", outputDirectory,
    "lib/domain.ts",
    "lib/auto-added-recipes.ts",
    "tests/auto-added-recipes.test.ts"
  ],
  { cwd: projectRoot, stdio: "inherit" }
);

if (compile.status !== 0) process.exit(compile.status ?? 1);

const result = spawnSync(
  process.execPath,
  ["--test", path.join(outputDirectory, "tests", "auto-added-recipes.test.js")],
  { cwd: projectRoot, stdio: "inherit" }
);

process.exit(result.status ?? 1);
