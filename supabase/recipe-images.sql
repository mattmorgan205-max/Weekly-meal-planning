-- Run this once in the Supabase SQL editor after schema.sql/shared-household.sql.
-- Recipe photos stay private and are available to the snapshot owner and invited members.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  false,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.recipe_image_owner_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

drop policy if exists "Household members can read recipe images" on storage.objects;
drop policy if exists "Household members can add recipe images" on storage.objects;
drop policy if exists "Household members can update recipe images" on storage.objects;
drop policy if exists "Household members can delete recipe images" on storage.objects;

create policy "Household members can read recipe images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and private.can_access_household_snapshot(private.recipe_image_owner_id(name))
  );

create policy "Household members can add recipe images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'recipe-images'
    and private.can_access_household_snapshot(private.recipe_image_owner_id(name))
  );

create policy "Household members can update recipe images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and private.can_access_household_snapshot(private.recipe_image_owner_id(name))
  )
  with check (
    bucket_id = 'recipe-images'
    and private.can_access_household_snapshot(private.recipe_image_owner_id(name))
  );

create policy "Household members can delete recipe images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and private.can_access_household_snapshot(private.recipe_image_owner_id(name))
  );
