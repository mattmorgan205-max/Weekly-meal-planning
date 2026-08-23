-- Run this once after schema.sql, shared-household.sql, and recipe-images.sql.
-- It upgrades Weekwise from one shared owner snapshot to multiple switchable households.
-- Existing snapshots and invitations are migrated automatically when a user next signs in.

create extension if not exists "pgcrypto";
create schema if not exists private;

alter table public.households
  add column if not exists legacy_snapshot_owner_id uuid references auth.users(id) on delete set null;

create unique index if not exists households_legacy_snapshot_owner_id_key
  on public.households (legacy_snapshot_owner_id)
  where legacy_snapshot_owner_id is not null;

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  member_email text not null,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (household_id, member_email),
  check (member_email = lower(member_email))
);

create index if not exists household_members_user_id_idx
  on public.household_members (user_id);

create table if not exists public.household_app_snapshots (
  household_id uuid primary key references public.households(id) on delete cascade,
  app_state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_recipe_catalog (
  id uuid primary key default gen_random_uuid(),
  source_household_id uuid not null references public.households(id) on delete cascade,
  source_recipe_id text not null,
  recipe_data jsonb not null,
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_household_id, source_recipe_id)
);

create table if not exists public.recipe_reactions (
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('love', 'like', 'okay', 'not_again')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, recipe_id, user_id)
);

create index if not exists recipe_reactions_recipe_id_idx
  on public.recipe_reactions (recipe_id);

create or replace function private.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members member
    where member.household_id = target_household_id
      and (
        member.user_id = (select auth.uid())
        or lower(member.member_email) = lower((select auth.jwt() ->> 'email'))
      )
  );
$$;

create or replace function private.can_edit_household(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members member
    where member.household_id = target_household_id
      and member.role in ('owner', 'editor')
      and (
        member.user_id = (select auth.uid())
        or lower(member.member_email) = lower((select auth.jwt() ->> 'email'))
      )
  );
$$;

create or replace function private.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members member
    where member.household_id = target_household_id
      and member.role = 'owner'
      and (
        member.user_id = (select auth.uid())
        or lower(member.member_email) = lower((select auth.jwt() ->> 'email'))
      )
  );
$$;

-- Keep old owner-based image paths working and also accept the new household-id paths.
create or replace function private.can_access_household_snapshot(snapshot_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    snapshot_owner_id = (select auth.uid())
    or private.is_household_member(snapshot_owner_id)
    or exists (
      select 1
      from public.household_snapshot_members member
      where member.owner_user_id = snapshot_owner_id
        and (
          member.member_user_id = (select auth.uid())
          or lower(member.member_email) = lower((select auth.jwt() ->> 'email'))
        )
    );
$$;

alter table public.household_members enable row level security;
alter table public.household_app_snapshots enable row level security;
alter table public.shared_recipe_catalog enable row level security;
alter table public.recipe_reactions enable row level security;

drop policy if exists "Household members can read households" on public.households;
create policy "Household members can read households"
  on public.households for select to authenticated
  using (private.is_household_member(id));

drop policy if exists "Household owners can rename households" on public.households;
create policy "Household owners can rename households"
  on public.households for update to authenticated
  using (private.is_household_owner(id))
  with check (private.is_household_owner(id));

drop policy if exists "Household members can read membership" on public.household_members;
create policy "Household members can read membership"
  on public.household_members for select to authenticated
  using (private.is_household_member(household_id));

drop policy if exists "Household owners can add membership" on public.household_members;
create policy "Household owners can add membership"
  on public.household_members for insert to authenticated
  with check (private.is_household_owner(household_id));

drop policy if exists "Household owners can update membership" on public.household_members;
create policy "Household owners can update membership"
  on public.household_members for update to authenticated
  using (private.is_household_owner(household_id))
  with check (private.is_household_owner(household_id));

drop policy if exists "Household owners can remove membership" on public.household_members;
create policy "Household owners can remove membership"
  on public.household_members for delete to authenticated
  using (private.is_household_owner(household_id) and role <> 'owner');

drop policy if exists "Household members can read app snapshots" on public.household_app_snapshots;
create policy "Household members can read app snapshots"
  on public.household_app_snapshots for select to authenticated
  using (private.is_household_member(household_id));

drop policy if exists "Household editors can add app snapshots" on public.household_app_snapshots;
create policy "Household editors can add app snapshots"
  on public.household_app_snapshots for insert to authenticated
  with check (private.can_edit_household(household_id));

drop policy if exists "Household editors can update app snapshots" on public.household_app_snapshots;
create policy "Household editors can update app snapshots"
  on public.household_app_snapshots for update to authenticated
  using (private.can_edit_household(household_id))
  with check (private.can_edit_household(household_id));

drop policy if exists "Household owners can delete app snapshots" on public.household_app_snapshots;
create policy "Household owners can delete app snapshots"
  on public.household_app_snapshots for delete to authenticated
  using (private.is_household_owner(household_id));

drop policy if exists "Signed in users can read shared recipes" on public.shared_recipe_catalog;
create policy "Signed in users can read shared recipes"
  on public.shared_recipe_catalog for select to authenticated
  using (active);

drop policy if exists "Household editors can publish recipes" on public.shared_recipe_catalog;
create policy "Household editors can publish recipes"
  on public.shared_recipe_catalog for insert to authenticated
  with check (private.can_edit_household(source_household_id));

drop policy if exists "Household editors can update published recipes" on public.shared_recipe_catalog;
create policy "Household editors can update published recipes"
  on public.shared_recipe_catalog for update to authenticated
  using (private.can_edit_household(source_household_id))
  with check (private.can_edit_household(source_household_id));

drop policy if exists "Household editors can remove published recipes" on public.shared_recipe_catalog;
create policy "Household editors can remove published recipes"
  on public.shared_recipe_catalog for delete to authenticated
  using (private.can_edit_household(source_household_id));

drop policy if exists "Users can read their recipe reactions" on public.recipe_reactions;
create policy "Users can read their recipe reactions"
  on public.recipe_reactions for select to authenticated
  using (user_id = (select auth.uid()) and private.is_household_member(household_id));

drop policy if exists "Users can add their recipe reactions" on public.recipe_reactions;
create policy "Users can add their recipe reactions"
  on public.recipe_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_household_member(household_id));

drop policy if exists "Users can update their recipe reactions" on public.recipe_reactions;
create policy "Users can update their recipe reactions"
  on public.recipe_reactions for update to authenticated
  using (user_id = (select auth.uid()) and private.is_household_member(household_id))
  with check (user_id = (select auth.uid()) and private.is_household_member(household_id));

drop policy if exists "Users can remove their recipe reactions" on public.recipe_reactions;
create policy "Users can remove their recipe reactions"
  on public.recipe_reactions for delete to authenticated
  using (user_id = (select auth.uid()) and private.is_household_member(household_id));

create or replace function private.can_read_weekwise_recipe_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.can_access_household_snapshot(private.recipe_image_owner_id(object_name))
    or exists (
      select 1
      from public.shared_recipe_catalog catalog
      where catalog.active
        and catalog.recipe_data ->> 'mealImagePath' = object_name
    );
$$;

drop policy if exists "Household members can read recipe images" on storage.objects;
create policy "Household members can read recipe images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and private.can_read_weekwise_recipe_image(name)
  );

create or replace function public.bootstrap_weekwise_households()
returns table (id uuid, name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  legacy_owner_id uuid;
  target_household_id uuid;
  target_name text;
begin
  if current_user_id is null then
    raise exception 'Sign in before loading households.';
  end if;

  update public.household_members
  set user_id = current_user_id
  where user_id is null and member_email = current_email;

  for legacy_owner_id in
    select candidate.owner_id
    from (
      select current_user_id as owner_id
      union
      select member.owner_user_id
      from public.household_snapshot_members member
      where member.member_user_id = current_user_id
         or lower(member.member_email) = current_email
    ) candidate
    where exists (
      select 1 from public.household_snapshots snapshot
      where snapshot.user_id = candidate.owner_id
    )
  loop
    select household.id into target_household_id
    from public.households household
    where household.legacy_snapshot_owner_id = legacy_owner_id
    limit 1;

    if target_household_id is null then
      select coalesce(nullif(snapshot.app_state #>> '{settings,householdName}', ''), 'Home')
      into target_name
      from public.household_snapshots snapshot
      where snapshot.user_id = legacy_owner_id;

      insert into public.households (owner_id, name, legacy_snapshot_owner_id)
      values (legacy_owner_id, coalesce(target_name, 'Home'), legacy_owner_id)
      returning households.id into target_household_id;
    end if;

    insert into public.household_members (household_id, user_id, member_email, role)
    select
      target_household_id,
      legacy_owner_id,
      lower(coalesce(account.email, legacy_owner_id::text || '@legacy.local')),
      'owner'
    from auth.users account
    where account.id = legacy_owner_id
    on conflict (household_id, member_email) do update
      set user_id = excluded.user_id, role = 'owner';

    insert into public.household_members (household_id, user_id, member_email, role)
    select target_household_id, member.member_user_id, lower(member.member_email), 'editor'
    from public.household_snapshot_members member
    where member.owner_user_id = legacy_owner_id
    on conflict (household_id, member_email) do update
      set user_id = coalesce(excluded.user_id, household_members.user_id), role = 'editor';

    insert into public.household_app_snapshots (household_id, app_state, updated_at)
    select target_household_id, snapshot.app_state, snapshot.updated_at
    from public.household_snapshots snapshot
    where snapshot.user_id = legacy_owner_id
    on conflict (household_id) do nothing;
  end loop;

  insert into public.household_members (household_id, user_id, member_email, role)
  select household.id, current_user_id, current_email, 'owner'
  from public.households household
  where household.owner_id = current_user_id
  on conflict (household_id, member_email) do update
    set user_id = excluded.user_id, role = 'owner';

  if not exists (
    select 1 from public.household_members member
    where member.user_id = current_user_id or member.member_email = current_email
  ) then
    insert into public.households (owner_id, name)
    values (current_user_id, 'Home')
    returning households.id into target_household_id;

    insert into public.household_members (household_id, user_id, member_email, role)
    values (target_household_id, current_user_id, current_email, 'owner');
  end if;

  return query
  select household.id, household.name, member.role
  from public.household_members member
  join public.households household on household.id = member.household_id
  where member.user_id = current_user_id or member.member_email = current_email
  order by (member.role = 'owner') desc, household.created_at, household.name;
end;
$$;

create or replace function public.create_weekwise_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  new_household_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in before creating a household.';
  end if;

  insert into public.households (owner_id, name)
  values (current_user_id, coalesce(nullif(trim(household_name), ''), 'New household'))
  returning households.id into new_household_id;

  insert into public.household_members (household_id, user_id, member_email, role)
  values (new_household_id, current_user_id, current_email, 'owner');

  return new_household_id;
end;
$$;

create or replace function public.invite_weekwise_household_member(
  target_household_id uuid,
  invite_email text,
  invite_role text default 'editor'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(invite_email));
  invited_user_id uuid;
begin
  if not private.is_household_owner(target_household_id) then
    raise exception 'Only a household owner can invite members.';
  end if;
  if normalized_email = '' then
    raise exception 'Enter an email address.';
  end if;
  if invite_role not in ('editor', 'viewer') then
    raise exception 'Choose editor or viewer access.';
  end if;

  select account.id into invited_user_id
  from auth.users account
  where lower(account.email) = normalized_email
  limit 1;

  insert into public.household_members (household_id, user_id, member_email, role)
  values (target_household_id, invited_user_id, normalized_email, invite_role)
  on conflict (household_id, member_email) do update
    set user_id = coalesce(excluded.user_id, household_members.user_id), role = excluded.role;
end;
$$;

create or replace function public.get_weekwise_recipe_popularity(recipe_ids text[] default null)
returns table (
  recipe_id text,
  love_count integer,
  like_count integer,
  okay_count integer,
  not_again_count integer,
  rating_count integer,
  household_count integer,
  popularity_score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    reaction.recipe_id,
    count(*) filter (where reaction.reaction = 'love')::integer,
    count(*) filter (where reaction.reaction = 'like')::integer,
    count(*) filter (where reaction.reaction = 'okay')::integer,
    count(*) filter (where reaction.reaction = 'not_again')::integer,
    count(*)::integer,
    count(distinct reaction.household_id)::integer,
    round(avg(case reaction.reaction
      when 'love' then 2
      when 'like' then 1
      when 'okay' then 0
      when 'not_again' then -2
    end)::numeric, 2)
  from public.recipe_reactions reaction
  where auth.uid() is not null
    and (recipe_ids is null or reaction.recipe_id = any(recipe_ids))
  group by reaction.recipe_id;
$$;

grant execute on function public.bootstrap_weekwise_households() to authenticated;
grant execute on function public.create_weekwise_household(text) to authenticated;
grant execute on function public.invite_weekwise_household_member(uuid, text, text) to authenticated;
grant execute on function public.get_weekwise_recipe_popularity(text[]) to authenticated;
