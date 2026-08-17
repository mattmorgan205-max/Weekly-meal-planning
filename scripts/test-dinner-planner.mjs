import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiler = path.join(projectRoot, "node_modules", ".bin", "tsc");
const outputDirectory = "/tmp/weekwise-dinner-tests";

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
    "lib/dinner-planner.ts",
    "tests/dinner-planner.test.ts"
  ],
  { cwd: projectRoot, stdio: "inherit" }
);

if (compile.status !== 0) process.exit(compile.status ?? 1);

const test = spawnSync(
  process.execPath,
  ["--test", path.join(outputDirectory, "tests", "dinner-planner.test.js")],
  { cwd: projectRoot, stdio: "inherit" }
);

process.exit(test.status ?? 1);
