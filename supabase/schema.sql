create extension if not exists "pgcrypto";

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Home',
  default_people integer not null default 4 check (default_people > 0),
  hidden_slots text[] not null default '{}',
  staple_ingredients text[] not null default array['salt', 'black pepper', 'olive oil'],
  include_staples boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  servings integer not null check (servings > 0),
  prep_minutes integer,
  cook_minutes integer,
  tags text[] not null default '{}',
  favorite boolean not null default false,
  instructions text[] not null default '{}',
  source_url text,
  photo_path text,
  notes text,
  imported_from text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  category text not null default 'Other',
  note text,
  confidence text not null default 'medium'
);

create table if not exists planned_meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  meal_date date not null,
  slot text not null,
  people_count integer not null check (people_count > 0),
  notes text,
  produces_leftovers boolean not null default false,
  leftover_target_date date,
  created_at timestamptz not null default now()
);

create table if not exists import_jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  source_type text not null,
  source_url text,
  photo_path text,
  raw_text text,
  draft jsonb not null default '{}'::jsonb,
  warnings text[] not null default '{}',
  status text not null default 'review',
  created_at timestamptz not null default now()
);

create table if not exists shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  week_start date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, week_start)
);

create table if not exists shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references shopping_lists(id) on delete cascade,
  name text not null,
  display_quantity text,
  category text not null default 'Other',
  source_meals text[] not null default '{}',
  checked boolean not null default false,
  manual boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- The implemented MVP uses this snapshot table for simple cross-device sync.
-- The normalized tables above are ready for a later migration to row-level sync.
create table if not exists household_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists household_snapshot_members (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_email text not null,
  member_user_id uuid references auth.users(id) on delete set null,
  role text not null default 'member' check (role = 'member'),
  created_at timestamptz not null default now(),
  primary key (owner_user_id, member_email),
  check (member_email = lower(member_email))
);

create schema if not exists private;

create or replace function private.can_access_household_snapshot(snapshot_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    snapshot_owner_id = (select auth.uid())
    or exists (
      select 1
      from public.household_snapshot_members m
      where m.owner_user_id = snapshot_owner_id
        and (
          m.member_user_id = (select auth.uid())
          or lower(m.member_email) = lower((select auth.jwt() ->> 'email'))
        )
    );
$$;

alter table households enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table planned_meals enable row level security;
alter table import_jobs enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_list_items enable row level security;
alter table household_snapshots enable row level security;
alter table household_snapshot_members enable row level security;

drop policy if exists "Users manage own snapshots" on household_snapshots;
drop policy if exists "Household snapshot members can read" on household_snapshots;
drop policy if exists "Household snapshot members can insert" on household_snapshots;
drop policy if exists "Household snapshot members can update" on household_snapshots;
drop policy if exists "Household snapshot owners can delete" on household_snapshots;

create policy "Household snapshot members can read"
  on household_snapshots
  for select
  to authenticated
  using (private.can_access_household_snapshot(user_id));

create policy "Household snapshot members can insert"
  on household_snapshots
  for insert
  to authenticated
  with check (private.can_access_household_snapshot(user_id));

create policy "Household snapshot members can update"
  on household_snapshots
  for update
  to authenticated
  using (private.can_access_household_snapshot(user_id))
  with check (private.can_access_household_snapshot(user_id));

create policy "Household snapshot owners can delete"
  on household_snapshots
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Members can read household invites" on household_snapshot_members;
drop policy if exists "Owners can add household members" on household_snapshot_members;
drop policy if exists "Owners can remove household members" on household_snapshot_members;
drop policy if exists "Invited members can link themselves" on household_snapshot_members;

create policy "Members can read household invites"
  on household_snapshot_members
  for select
  to authenticated
  using (
    owner_user_id = (select auth.uid())
    or member_user_id = (select auth.uid())
    or lower(member_email) = lower((select auth.jwt() ->> 'email'))
  );

create policy "Owners can add household members"
  on household_snapshot_members
  for insert
  to authenticated
  with check (owner_user_id = (select auth.uid()));

create policy "Owners can remove household members"
  on household_snapshot_members
  for delete
  to authenticated
  using (owner_user_id = (select auth.uid()));

create policy "Owners manage households"
  on households
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners manage recipes"
  on recipes
  for all
  using (exists (select 1 from households h where h.id = recipes.household_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from households h where h.id = recipes.household_id and h.owner_id = auth.uid()));

create policy "Owners manage recipe ingredients"
  on recipe_ingredients
  for all
  using (
    exists (
      select 1
      from recipes r
      join households h on h.id = r.household_id
      where r.id = recipe_ingredients.recipe_id
        and h.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from recipes r
      join households h on h.id = r.household_id
      where r.id = recipe_ingredients.recipe_id
        and h.owner_id = auth.uid()
    )
  );

create policy "Owners manage planned meals"
  on planned_meals
  for all
  using (exists (select 1 from households h where h.id = planned_meals.household_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from households h where h.id = planned_meals.household_id and h.owner_id = auth.uid()));

create policy "Owners manage import jobs"
  on import_jobs
  for all
  using (exists (select 1 from households h where h.id = import_jobs.household_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from households h where h.id = import_jobs.household_id and h.owner_id = auth.uid()));

create policy "Owners manage shopping lists"
  on shopping_lists
  for all
  using (exists (select 1 from households h where h.id = shopping_lists.household_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from households h where h.id = shopping_lists.household_id and h.owner_id = auth.uid()));

create policy "Owners manage shopping list items"
  on shopping_list_items
  for all
  using (
    exists (
      select 1
      from shopping_lists s
      join households h on h.id = s.household_id
      where s.id = shopping_list_items.shopping_list_id
        and h.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from shopping_lists s
      join households h on h.id = s.household_id
      where s.id = shopping_list_items.shopping_list_id
        and h.owner_id = auth.uid()
    )
  );
