-- Prerequisite: multi-household.sql. Run in the Supabase SQL editor before
-- deploying the new client. Old clients must reload: direct snapshot writes
-- are deliberately disabled. Existing rows and image permissions are retained.
begin;
alter table public.household_app_snapshots add column if not exists revision bigint not null default 1;
alter table public.household_snapshots add column if not exists revision bigint not null default 1;

create or replace function public.sync_weekwise_household(
  target_id uuid, legacy boolean default false,
  expected_revision bigint default null, new_state jsonb default null,
  catalog_recipes jsonb default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  current_state jsonb;
  current_revision bigint;
  allowed boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to sync your household.' using errcode = '42501'; end if;
  if legacy then
    allowed := private.can_access_household_snapshot(target_id);
  elsif new_state is null then
    allowed := private.is_household_member(target_id);
  else
    allowed := private.can_edit_household(target_id);
  end if;
  if not coalesce(allowed, false) then raise exception 'Household access denied.' using errcode = '42501'; end if;
  if new_state is not null and (jsonb_typeof(new_state) <> 'object' or expected_revision is null or expected_revision < 0) then
    raise exception 'A household object and expected revision are required.';
  end if;
  if new_state is not null and (jsonb_typeof(new_state -> 'recipes') is distinct from 'array' or jsonb_typeof(new_state -> 'settings') is distinct from 'object') then
    raise exception 'The household must contain recipes and settings.';
  end if;
  if catalog_recipes is not null and jsonb_typeof(catalog_recipes) <> 'array' then
    raise exception 'Shared recipes must be an array.';
  end if;
  -- Also serializes creation when the snapshot row does not exist yet.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('weekwise:' || legacy::text || ':' || target_id::text, 0));
  if legacy then
    select app_state, revision into current_state, current_revision from public.household_snapshots where user_id = target_id for update;
  else
    select app_state, revision into current_state, current_revision from public.household_app_snapshots where household_id = target_id for update;
  end if;
  current_revision := coalesce(current_revision, 0);
  if new_state is null or expected_revision <> current_revision then
    return jsonb_build_object('state', current_state, 'version', current_revision, 'applied', false);
  end if;
  if legacy then
    insert into public.household_snapshots(user_id, app_state, revision, updated_at)
      values(target_id, new_state, current_revision + 1, now())
      on conflict(user_id) do update set app_state = excluded.app_state, revision = excluded.revision, updated_at = excluded.updated_at;
  else
    insert into public.household_app_snapshots(household_id, app_state, revision, updated_at)
      values(target_id, new_state, current_revision + 1, now())
      on conflict(household_id) do update set app_state = excluded.app_state, revision = excluded.revision, updated_at = excluded.updated_at;
    -- Publish only the projection accompanying this accepted revision. A stale
    -- request cannot overwrite the catalogue after a newer household save.
    if catalog_recipes is not null then
      update public.shared_recipe_catalog c set active = false, updated_at = now()
        where c.source_household_id = target_id and c.active
          and not exists (select 1 from jsonb_array_elements(catalog_recipes) r where r ->> 'id' = c.source_recipe_id);
      insert into public.shared_recipe_catalog(source_household_id, source_recipe_id, recipe_data, active)
        select target_id, r ->> 'id', r - 'catalogEntryId' || jsonb_build_object('favorite', false, 'householdTags', '[]'::jsonb, 'visibility', 'global', 'catalogSourceHouseholdId', target_id), true
        from jsonb_array_elements(catalog_recipes) r
        where r ->> 'id' is not null and r ->> 'visibility' = 'global'
          and coalesce(r ->> 'catalogSourceHouseholdId', target_id::text) = target_id::text
          and exists (select 1 from jsonb_array_elements(new_state -> 'recipes') s where s ->> 'id' = r ->> 'id' and s ->> 'visibility' = 'global')
        on conflict(source_household_id, source_recipe_id) do update
          set recipe_data = excluded.recipe_data, active = true, updated_at = now(), version = public.shared_recipe_catalog.version + 1
          where public.shared_recipe_catalog.recipe_data is distinct from excluded.recipe_data or not public.shared_recipe_catalog.active;
    end if;
    if private.is_household_owner(target_id) and nullif(trim(new_state #>> '{settings,householdName}'), '') is not null then
      update public.households set name = trim(new_state #>> '{settings,householdName}') where id = target_id;
    end if;
  end if;
  return jsonb_build_object('state', new_state, 'version', current_revision + 1, 'applied', true);
end;
$$;
revoke all on function public.sync_weekwise_household(uuid, boolean, bigint, jsonb, jsonb) from public, anon;
grant execute on function public.sync_weekwise_household(uuid, boolean, bigint, jsonb, jsonb) to authenticated;
revoke insert, update, delete on public.household_app_snapshots, public.household_snapshots from public, anon, authenticated;
revoke insert, update, delete on public.shared_recipe_catalog from public, anon, authenticated;
grant select on public.household_app_snapshots, public.household_snapshots to authenticated;
commit;
