-- 009: Supabase Storage buckets + RLS
--
-- Path convention (enforced by the app, verified by these policies):
--   receipts bucket:  private/<owner_profile_id>/<filename>   (personal documents)
--                      family/<family_id>/<filename>           (family/project documents)
--   avatars bucket:    <profile_id>/<filename>                 (public-read profile photos)

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- ---------- receipts (private) ----------

create policy "receipts_select_own_or_family"
on storage.objects for select
using (
  bucket_id = 'receipts'
  and (
    ((storage.foldername(name))[1] = 'private' and (storage.foldername(name))[2] = current_profile_id()::text)
    or
    ((storage.foldername(name))[1] = 'family' and is_family_member(((storage.foldername(name))[2])::uuid))
  )
);

create policy "receipts_insert_own_or_family"
on storage.objects for insert
with check (
  bucket_id = 'receipts'
  and (
    ((storage.foldername(name))[1] = 'private' and (storage.foldername(name))[2] = current_profile_id()::text)
    or
    ((storage.foldername(name))[1] = 'family' and is_family_member(((storage.foldername(name))[2])::uuid))
  )
);

create policy "receipts_delete_own_or_family_admin"
on storage.objects for delete
using (
  bucket_id = 'receipts'
  and (
    ((storage.foldername(name))[1] = 'private' and (storage.foldername(name))[2] = current_profile_id()::text)
    or
    ((storage.foldername(name))[1] = 'family' and is_family_admin(((storage.foldername(name))[2])::uuid))
  )
);

-- ---------- avatars (public read, owner write) ----------

create policy "avatars_public_read"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "avatars_owner_write"
on storage.objects for insert
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = current_profile_id()::text);

create policy "avatars_owner_update"
on storage.objects for update
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = current_profile_id()::text);

create policy "avatars_owner_delete"
on storage.objects for delete
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = current_profile_id()::text);
