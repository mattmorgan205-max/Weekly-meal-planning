import { test } from "node:test";
import assert from "node:assert/strict";
import { HouseholdSync, mergeHousehold, same, type Json, type Snapshot, type Checkpoint } from "../lib/household-sync";

const copy = <T>(v: T): T => structuredClone(v);
const initial = () => ({ recipes: [{ id: "soup", title: "Soup", servings: 4, ingredients: [{ id: "salt", quantity: 1 }] }], settings: { householdName: "Home" }, dayNotes: {}, shoppingChecks: {} });
function server(state: Json | null = initial()) {
  let snapshot: Snapshot = { state: copy(state), version: state ? 1 : 0, applied: false };
  return {
    read: async () => copy(snapshot),
    write: async (version: number, state: Json) => {
      if (version !== snapshot.version) return { ...copy(snapshot), applied: false };
      snapshot = { state: copy(state), version: version + 1, applied: true };
      return copy(snapshot);
    },
    get snapshot() { return copy(snapshot); }
  };
}
function device(db: ReturnType<typeof server>) {
  let local: Json = initial();
  let checkpoint: Checkpoint | undefined;
  let status = "";
  const sync = new HouseholdSync({ read: db.read, write: db.write, getLocal: () => local, setLocal: v => { local = copy(v); }, persist: v => { checkpoint = copy(v); }, report: s => { status = s; } });
  return { sync, get local() { return local as ReturnType<typeof initial>; }, set local(v: ReturnType<typeof initial>) { local = v; }, get checkpoint() { return checkpoint; }, get status() { return status; } };
}

test("three devices concurrently edit separate fields without overwriting", async () => {
  const db = server(), devices = [device(db), device(db), device(db)];
  await Promise.all(devices.map(d => d.sync.open(initial())));
  devices[0].local.recipes[0].title = "Tomato soup";
  devices[1].local.recipes[0].servings = 6;
  devices[2].local.shoppingChecks = { milk: true };
  await Promise.all(devices.map(d => d.sync.sync()));
  await Promise.all(devices.map(d => d.sync.sync()));
  for (const d of devices) {
    assert.equal(d.local.recipes[0].title, "Tomato soup");
    assert.equal(d.local.recipes[0].servings, 6);
    assert.deepEqual(d.local.shoppingChecks, { milk: true });
    assert.equal(d.status, "saved");
    assert.deepEqual(d.local, db.snapshot.state);
  }
});
test("same-field edits pause; either resolution preserves independent edits", async () => {
  for (const prefer of ["local", "remote"] as const) {
    const db = server(), a = device(db), b = device(db);
    await a.sync.open(initial()); await b.sync.open(initial());
    a.local.recipes[0].title = "A"; b.local.recipes[0].title = "B";
    a.local.dayNotes = { monday: "A note" }; b.local.shoppingChecks = { milk: true };
    await a.sync.sync(); assert.equal(await b.sync.sync(), false);
    assert.equal(b.status, "conflict"); assert.equal(b.local.recipes[0].title, "B");
    assert.equal(b.sync.conflict?.details[0].remote, "A");
    await b.sync.resolve(prefer);
    assert.equal(b.local.recipes[0].title, prefer === "local" ? "B" : "A");
    assert.deepEqual(b.local.dayNotes, { monday: "A note" });
    assert.deepEqual(b.local.shoppingChecks, { milk: true });
  }
});
test("keyed additions, deletions and ingredient changes merge", () => {
  const base = { rows: [{ id: "a", value: 1 }, { id: "b", value: 1 }] };
  const local = { rows: [{ id: "b", value: 2 }, { id: "c", value: 3 }] };
  const remote = { rows: [...base.rows, { id: "d", value: 4 }] };
  const merged = mergeHousehold(base, local, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.state, { rows: [{ id: "b", value: 2 }, { id: "d", value: 4 }, { id: "c", value: 3 }] });
});
test("delete versus edit cannot silently discard an item", () => {
  const b = { recipes: [{ id: "x", title: "Original" }] };
  const l = { recipes: [] }, r = { recipes: [{ id: "x", title: "Edited" }] };
  assert.deepEqual(mergeHousehold(b, l, r).conflicts, ["recipes[x]"]);
  assert.deepEqual(mergeHousehold(b, l, r, "remote").state, r);
});
test("ordered methods conflict rather than mixing steps; timestamps do not", () => {
  const b = { instructions: ["One"], updatedAt: "2026-01-01" };
  const l = { instructions: ["Local"], updatedAt: "2026-01-02" };
  const r = { instructions: ["Remote"], updatedAt: "2026-01-03" };
  assert.deepEqual(mergeHousehold(b, l, r).conflicts, ["instructions"]);
  assert.equal((mergeHousehold(b, l, r).state as typeof b).updatedAt, r.updatedAt);
});
test("different guided shops require a choice, not hybrid dates and checks", () => {
  const b = { guidedShop: { id: "old", startDate: "1", endDate: "2" } };
  const l = { guidedShop: { id: "new", startDate: "3", endDate: "4" } };
  const r = { guidedShop: { id: "old", startDate: "1", endDate: "5" } };
  assert.deepEqual(mergeHousehold(b, l, r).conflicts, ["guidedShop"]);
});
test("snack selections merge by recipe and attendance by person", () => {
  const b = { snacks: [], diners: { monday: { a: 1, b: 1 } } };
  const l = { snacks: [{ recipeId: "a", servings: 2 }], diners: { monday: { a: 0, b: 1 } } };
  const r = { snacks: [{ recipeId: "b", servings: 3 }], diners: { monday: { a: 1, b: 0 } } };
  const merged = mergeHousehold(b, l, r);
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.state, { snacks: [...r.snacks, ...l.snacks], diners: { monday: { a: 0, b: 0 } } });
});
test("offline checkpoint survives reload and merges after reconnect", async () => {
  const db = server(), a = device(db), b = device(db);
  await a.sync.open(initial()); await b.sync.open(initial());
  a.local.dayNotes = { monday: "Offline edit" }; a.sync.remember(); a.sync.close();
  b.local.recipes[0].title = "Cloud edit"; await b.sync.sync();
  const restarted = device(db); await restarted.sync.open(initial(), a.checkpoint);
  assert.deepEqual(restarted.local.dayNotes, { monday: "Offline edit" });
  assert.equal(restarted.local.recipes[0].title, "Cloud edit");
});
test("editing during a delayed write remains pending and is saved", async () => {
  const db = server(); let held: (() => void) | undefined;
  const delayed = { ...db, write: async (v: number, s: Json) => { if (held === undefined) await new Promise<void>(resolve => { held = resolve; }); return db.write(v, s); } };
  const d = device(delayed); await d.sync.open(initial());
  d.local.recipes[0].title = "First";
  const pending = d.sync.sync(); await new Promise(resolve => setImmediate(resolve));
  d.local.recipes[0].title = "Second"; held!();
  await pending; assert.equal((db.snapshot.state as ReturnType<typeof initial>).recipes[0].title, "Second");
});
test("conflicting edit during write is not silently overwritten", async () => {
  const db = server(), other = device(db); await other.sync.open(initial());
  let held: (() => void) | undefined;
  const d = device({ ...db, write: async (v, s) => { await new Promise<void>(resolve => { held = resolve; }); return db.write(v, s); } });
  await d.sync.open(initial()); other.local.recipes[0].title = "Remote"; await other.sync.sync();
  d.local.shoppingChecks = { milk: true };
  const pending = d.sync.sync(); await new Promise(resolve => setImmediate(resolve));
  d.local.recipes[0].title = "Typed during save"; held!(); await pending;
  assert.equal(d.status, "conflict"); assert.equal(d.local.recipes[0].title, "Typed during save");
});
test("server acknowledgement lost after commit is safe to retry", async () => {
  const db = server(); let fail = true;
  const d = device({ ...db, write: async (v, s) => { const result = await db.write(v, s); if (fail) { fail = false; throw Error("Network lost"); } return result; } });
  await d.sync.open(initial()); d.local.recipes[0].title = "Saved";
  assert.equal(await d.sync.sync(), false); const version = db.snapshot.version;
  assert.equal(await d.sync.sync(), true); assert.equal(db.snapshot.version, version);
});
test("a closed household session cannot apply a late response", async () => {
  let release: ((s: Snapshot) => void) | undefined;
  const d = device({ ...server(), read: () => new Promise(resolve => { release = resolve; }) });
  const opening = d.sync.open(initial()); d.sync.close();
  release!({ state: { secret: "Other household" }, version: 1, applied: false }); await opening;
  assert.deepEqual(d.local, initial());
});
test("simultaneous creation uses revision zero and retains both additions", async () => {
  const db = server(null), a = device(db), b = device(db);
  a.local.dayNotes = { monday: "A" }; b.local.dayNotes = { tuesday: "B" };
  await Promise.all([a.sync.open(a.local), b.sync.open(b.local)]);
  await a.sync.sync(); await b.sync.sync();
  assert.deepEqual(a.local.dayNotes, { monday: "A", tuesday: "B" });
});
test("single-flight sync and semantic equality avoid duplicate writes", async () => {
  const db = server(), d = device(db); await d.sync.open(initial());
  d.local.dayNotes = { monday: "Note" };
  const a = d.sync.sync(), b = d.sync.sync(); assert.equal(a, b); await a;
  assert.equal(db.snapshot.version, 2);
  assert(same({ a: 1, b: 2 }, { b: 2, a: 1 }));
});
test("storage failure does not throw from edit or close handlers", async () => {
  const db = server(); let local: Json = initial();
  const sync = new HouseholdSync({ ...db, getLocal: () => local, setLocal: v => { local = v; }, persist: () => { throw Error("Quota"); }, report: () => {} });
  await sync.open(initial()); assert.doesNotThrow(() => sync.remember()); assert.doesNotThrow(() => sync.close());
});
test("reload while offline retains its baseline and later reconnects safely", async () => {
  const db = server(), original = device(db), other = device(db);
  await original.sync.open(initial()); await other.sync.open(initial());
  original.local.dayNotes = { monday: "Before closing" }; original.sync.remember();
  let offline = true;
  const reopened = device({ ...db, read: async () => { if (offline) throw Error("Offline"); return db.read(); } });
  await assert.rejects(reopened.sync.open(initial(), original.checkpoint), /Offline/);
  reopened.local.shoppingChecks = { eggs: true };
  other.local.recipes[0].title = "Changed elsewhere"; await other.sync.sync();
  offline = false; await reopened.sync.sync();
  assert.deepEqual(reopened.local.shoppingChecks, { eggs: true });
  assert.deepEqual(reopened.local.dayNotes, { monday: "Before closing" });
  assert.equal(reopened.local.recipes[0].title, "Changed elsewhere");
});
test("fresh remote edits after conflict selection require another decision", async () => {
  const db = server(), a = device(db), b = device(db);
  await a.sync.open(initial()); await b.sync.open(initial());
  a.local.recipes[0].title = "First shared"; b.local.recipes[0].title = "Local";
  await a.sync.sync(); await b.sync.sync();
  a.local.recipes[0].title = "New shared"; await a.sync.sync();
  assert.equal(await b.sync.resolve("local"), false);
  assert.equal(b.sync.conflict?.details[0].remote, "New shared");
});
