create table if not exists public.household_snapshot_members (
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

alter table public.household_snapshot_members enable row level security;
alter table public.household_snapshots enable row level security;

drop policy if exists "Users manage own snapshots" on public.household_snapshots;
drop policy if exists "Household snapshot members can read" on public.household_snapshots;
drop policy if exists "Household snapshot members can insert" on public.household_snapshots;
drop policy if exists "Household snapshot members can update" on public.household_snapshots;
drop policy if exists "Household snapshot owners can delete" on public.household_snapshots;

create policy "Household snapshot members can read"
  on public.household_snapshots
  for select
  to authenticated
  using (private.can_access_household_snapshot(user_id));

create policy "Household snapshot members can insert"
  on public.household_snapshots
  for insert
  to authenticated
  with check (private.can_access_household_snapshot(user_id));

create policy "Household snapshot members can update"
  on public.household_snapshots
  for update
  to authenticated
  using (private.can_access_household_snapshot(user_id))
  with check (private.can_access_household_snapshot(user_id));

create policy "Household snapshot owners can delete"
  on public.household_snapshots
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Members can read household invites" on public.household_snapshot_members;
drop policy if exists "Owners can add household members" on public.household_snapshot_members;
drop policy if exists "Owners can remove household members" on public.household_snapshot_members;
drop policy if exists "Invited members can link themselves" on public.household_snapshot_members;

create policy "Members can read household invites"
  on public.household_snapshot_members
  for select
  to authenticated
  using (
    owner_user_id = (select auth.uid())
    or member_user_id = (select auth.uid())
    or lower(member_email) = lower((select auth.jwt() ->> 'email'))
  );

create policy "Owners can add household members"
  on public.household_snapshot_members
  for insert
  to authenticated
  with check (owner_user_id = (select auth.uid()));

create policy "Owners can remove household members"
  on public.household_snapshot_members
  for delete
  to authenticated
  using (owner_user_id = (select auth.uid()));
