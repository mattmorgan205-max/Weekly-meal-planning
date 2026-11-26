import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const source = "extension/asda-helper";
const target = "dist/asda-helper-local";
await mkdir(target, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8"));
const app = manifest.content_scripts.find(entry => entry.js.includes("build/app-content.js"));
const local = ["http://localhost/*", "http://127.0.0.1/*"];
manifest.host_permissions = manifest.host_permissions.filter(pattern => !app.matches.includes(pattern)).concat(local);
app.matches = local;
manifest.name += " (local development)";
for (const name of ["build", "popup.html", "popup.css", "asda-overlay.css"]) {
  await cp(path.join(source, name), path.join(target, name), {recursive:true});
}
await writeFile(path.join(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Local-only Weekwise build:", path.resolve(target));
