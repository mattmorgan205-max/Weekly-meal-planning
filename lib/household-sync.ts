export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Snapshot = { version: number; state: Json | null; applied: boolean };
export type Checkpoint = { base: Json | null; local: Json; version: number; savedAt?: number };
export type ConflictDetail = { path: string; local: Json | undefined; remote: Json | undefined };
export type SyncConflict = { paths: string[]; details: ConflictDetail[]; remote: Snapshot };
const object = (v: Json | undefined): v is { [key: string]: Json } => !!v && typeof v === "object" && !Array.isArray(v);
export function same(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (object(a) && object(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => same(a[k], b[k]));
  return false;
}
export const jsonState = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;

// ID-bearing lists merge by identity, never by their array index. Ordered text
// lists (e.g. method steps) stay atomic so conflicting rewrites need a decision.
export function mergeHousehold(base: Json | undefined, local: Json | undefined, remote: Json | undefined, prefer: "local" | "remote" = "local") {
  const conflicts: string[] = [];
  const details: ConflictDetail[] = [];
  function conflict(path: string, local: Json | undefined, remote: Json | undefined) {
    conflicts.push(path || "household");
    details.push({ path: path || "household", local, remote });
    return prefer === "local" ? local : remote;
  }
  function visit(b: Json | undefined, l: Json | undefined, r: Json | undefined, path: string): Json | undefined {
    if (same(l, r) || same(b, r)) return l;
    if (same(b, l)) return r;
    if ((path === "updatedAt" || path.endsWith(".updatedAt")) && typeof l === "string" && typeof r === "string") return l > r ? l : r;
    if (object(l) && object(r) && (object(b) || b === undefined)) {
      if (l.id !== r.id) return conflict(path, l, r);
      const result: { [key: string]: Json } = {};
      for (const key of new Set([...Object.keys(b ?? {}), ...Object.keys(l), ...Object.keys(r)])) {
        const value = visit(object(b) ? b[key] : undefined, l[key], r[key], path ? `${path}.${key}` : key);
        if (value !== undefined) Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true });
      }
      return result;
    }
    if (Array.isArray(l) && Array.isArray(r) && (Array.isArray(b) || b === undefined)) {
      const arrays = [Array.isArray(b) ? b : [], l, r];
      const key = arrays.flat().every(v => object(v) && typeof v.id === "string") ? "id"
        : arrays.flat().every(v => object(v) && typeof v.recipeId === "string") ? "recipeId" : null;
      if (key && arrays.every(a => new Set(a.map(v => (v as Record<string, Json>)[key])).size === a.length)) {
        const [bm, lm, rm] = arrays.map(a => new Map(a.map(v => [(v as Record<string, Json>)[key] as string, v])));
        return [...new Set([...rm.keys(), ...lm.keys()])].flatMap(id => {
          const value = visit(bm.get(id), lm.get(id), rm.get(id), `${path}[${id}]`);
          return value === undefined ? [] : [value];
        });
      }
    }
    return conflict(path, l, r);
  }
  const state = visit(base, local, remote, "");
  return { state, conflicts, details };
}

export class HouseholdSync {
  base: Json | null = null;
  version = 0;
  active = true;
  ready = false;
  conflict: SyncConflict | null = null;
  private running: Promise<boolean> | null = null;
  constructor(private options: {
    read: () => Promise<Snapshot>;
    write: (version: number, state: Json) => Promise<Snapshot>;
    getLocal: () => Json;
    setLocal: (state: Json) => void;
    persist: (checkpoint: Checkpoint) => void;
    report: (status: "saving" | "saved" | "error" | "conflict", message?: string) => void;
  }) {}
  remember() {
    if (!this.active || !this.ready) return;
    try { this.options.persist({ base: this.base, local: this.options.getLocal(), version: this.version }); }
    catch { this.options.report("error", "Device storage is full. Keep this tab open until your changes are synced."); }
  }
  async open(initial: Json, checkpoint?: Checkpoint) {
    if (checkpoint) {
      this.base = checkpoint.base; this.version = checkpoint.version; this.ready = true;
      this.options.setLocal(checkpoint.local);
    }
    const before = jsonState(this.options.getLocal());
    const remote = await this.options.read();
    if (!this.active) return;
    if (!checkpoint) {
      const current = this.options.getLocal();
      const merged = mergeHousehold(before, current, remote.state ?? initial);
      this.base = merged.conflicts.length ? before : remote.state; this.version = remote.version;
      this.options.setLocal(merged.conflicts.length ? current : merged.state!);
      this.ready = true; this.remember();
    }
    await this.sync();
  }
  sync(): Promise<boolean> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => { this.running = null; });
    return this.running;
  }
  private async run() {
    if (!this.active || !this.ready) return false;
    try {
      this.remember();
      this.options.report("saving");
      for (let attempt = 0; attempt < 6 && this.active; attempt++) {
        const remote = await this.options.read();
        if (!this.active) return false;
        const local = jsonState(this.options.getLocal());
        const merged = mergeHousehold(this.base ?? undefined, local, remote.state ?? undefined);
        if (merged.conflicts.length) {
          this.conflict = { paths: merged.conflicts, details: merged.details, remote };
          this.options.report("conflict", "Another device changed the same information. Choose which conflicting changes to keep.");
          return false;
        }
        this.conflict = null;
        const proposed = merged.state!;
        const result = same(proposed, remote.state) ? { ...remote, applied: true } : await this.options.write(remote.version, proposed);
        if (!this.active) return false;
        if (!result.applied) continue;
        // Edits made during the request must remain pending after its acknowledgement.
        const duringRequest = mergeHousehold(local, this.options.getLocal(), proposed);
        if (duringRequest.conflicts.length) {
          this.base = local; this.version = result.version;
          this.conflict = { paths: duringRequest.conflicts, details: duringRequest.details, remote: result };
          this.remember();
          this.options.report("conflict", "This information changed while saving. Choose which version to keep.");
          return false;
        }
        const next = duringRequest.state!;
        this.base = result.state; this.version = result.version;
        this.options.setLocal(next); this.remember();
        if (same(next, this.base)) { this.options.report("saved"); return true; }
      }
      if (this.active) this.options.report("error", "The household is busy. Your changes remain on this device and will retry shortly.");
    } catch (error) {
      if (this.active) this.options.report("error", error instanceof Error ? error.message : "Sync failed. Your changes are retained on this device.");
    }
    return false;
  }
  resolve(prefer: "local" | "remote") {
    if (!this.conflict || !this.active) return;
    const { remote } = this.conflict;
    const merged = mergeHousehold(this.base ?? undefined, this.options.getLocal(), remote.state ?? undefined, prefer);
    this.base = remote.state; this.version = remote.version; this.conflict = null;
    this.options.setLocal(merged.state!); this.remember();
    return this.sync();
  }
  close() { this.remember(); this.active = false; }
}
