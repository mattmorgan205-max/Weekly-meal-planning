// Optional isolated PostgreSQL test. PGLITE_MODULE points to an installed PGlite
// module; no database URL or production credentials are used.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const household = "10000000-0000-0000-0000-000000000001";
const owner = "20000000-0000-0000-0000-000000000001";
const editor = "20000000-0000-0000-0000-000000000002";
const viewer = "20000000-0000-0000-0000-000000000003";
const outsider = "20000000-0000-0000-0000-000000000004";
const state = { recipes: [], settings: { householdName: "Home" } };
let checks = 0;
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid', true), '')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create table public.households(id uuid primary key, name text);
    create table public.household_snapshots(user_id uuid primary key references auth.users, app_state jsonb not null, updated_at timestamptz default now());
    create table public.household_snapshot_members(owner_user_id uuid, member_user_id uuid, member_email text);
    insert into auth.users values ('${owner}'), ('${editor}'), ('${viewer}'), ('${outsider}');
    insert into public.households values ('${household}', 'Home');
  `);
  const existing = readFileSync(new URL("../supabase/multi-household.sql", import.meta.url), "utf8");
  // Use the real membership functions and RLS policies, excluding unrelated
  // image storage and bootstrap functions that need Supabase-only services.
  await db.exec(existing.split("create or replace function private.can_read_weekwise_recipe_image")[0].replace('create extension if not exists "pgcrypto";', ''));
  await db.exec(`
    insert into public.household_members(household_id,user_id,member_email,role) values
      ('${household}','${owner}','owner@example.test','owner'),
      ('${household}','${editor}','editor@example.test','editor'),
      ('${household}','${viewer}','viewer@example.test','viewer');
    grant usage on schema public, auth, private to authenticated, anon;
    grant all on all tables in schema public to authenticated;
  `);
  const migration = readFileSync(new URL("../supabase/conflict-safe-sync.sql", import.meta.url), "utf8");
  await db.exec(migration); await db.exec(migration); checks++;
  const login = async (user, role = "authenticated") => { await db.exec(`reset role; set role ${role}; select set_config('test.uid','${user}',false);`); };
  const rpc = async (version = null, value = null, legacy = false, target = household, catalog = null) => (await db.query("select public.sync_weekwise_household($1,$2,$3,$4,$5) as result", [target, legacy, version, value && JSON.stringify(value), catalog && JSON.stringify(catalog)])).rows[0].result;
  await login(owner);
  assert.deepEqual(await rpc(), { state: null, version: 0, applied: false }); checks++;
  assert.equal((await rpc(0, state)).applied, true); checks++;
  assert.equal((await rpc(0, { ...state, settings: { householdName: "Stale" } })).applied, false); checks++;
  assert.deepEqual((await rpc()).state, state); checks++;
  await assert.rejects(db.exec(`update public.household_app_snapshots set app_state = '{}'`), /permission denied/); checks++;
  await assert.rejects(db.exec(`delete from public.household_snapshots`), /permission denied/); checks++;
  await assert.rejects(db.exec(`delete from public.shared_recipe_catalog`), /permission denied/); checks++;
  await assert.rejects(rpc(1, {}), /must contain/); checks++;
  await login(editor); assert.equal((await rpc(1, { ...state, dayNotes: { monday: "Editor" } })).applied, true); checks++;
  await login(viewer); assert.equal((await rpc()).version, 2); checks++;
  await assert.rejects(rpc(2, state), /access denied/); checks++;
  await login(outsider); await assert.rejects(rpc(), /access denied/); checks++;
  assert.equal((await db.query("select * from public.household_app_snapshots")).rows.length, 0); checks++;
  await login("", "anon"); await assert.rejects(rpc(), /permission denied/); checks++;
  await login(owner);
  const recipe = { id: "new", title: "Shared soup", visibility: "global" };
  const shared = { ...state, recipes: [recipe] };
  assert.equal((await rpc(2, shared, false, household, [recipe])).applied, true); checks++;
  assert.equal((await db.query("select recipe_data from public.shared_recipe_catalog")).rows[0].recipe_data.title, "Shared soup"); checks++;
  assert.equal((await rpc(2, { ...shared, recipes: [{ ...recipe, title: "Stale" }] }, false, household, [{ ...recipe, title: "Stale" }])).applied, false); checks++;
  assert.equal((await db.query("select recipe_data from public.shared_recipe_catalog")).rows[0].recipe_data.title, "Shared soup"); checks++;
  await rpc(3, state, false, household, []);
  assert.equal((await db.query("select * from public.shared_recipe_catalog")).rows.length, 0); checks++;
  assert.equal((await rpc(0, state, true, owner)).applied, true); checks++;
  await login(editor); await assert.rejects(rpc(null, null, true, owner), /access denied/); checks++;
  console.log(`Passed ${checks} PostgreSQL migration, CAS, catalogue and permission checks.`);
} finally { await db.close(); }
