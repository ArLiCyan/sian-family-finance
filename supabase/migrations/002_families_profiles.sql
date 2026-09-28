-- 002: Families, profiles, and family memberships

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'SIAN Family',
  currency text not null default 'PHP',
  timezone text not null default 'Asia/Manila',
  date_format text not null default 'MMMM d, yyyy',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_families_updated_at
  before update on families
  for each row execute function set_updated_at();

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text not null,
  middle_name text,
  last_name text not null,
  display_name text not null,
  profile_photo_url text,
  email text not null,
  phone text,
  date_joined date not null default current_date,
  status profile_status not null default 'active',
  theme_preference text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_auth_user_id on profiles(auth_user_id);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create table family_memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role family_role not null default 'member',
  status membership_status not null default 'active',
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, profile_id)
);

create index idx_family_memberships_family on family_memberships(family_id);
create index idx_family_memberships_profile on family_memberships(profile_id);

create trigger trg_family_memberships_updated_at
  before update on family_memberships
  for each row execute function set_updated_at();

-- Auto-provision a profile (and attach to the single SIAN Family) whenever a
-- new Supabase Auth user signs up. The first user ever created becomes the
-- Family Owner; everyone after that joins as a Family Member.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_profile_id uuid;
  v_first_name text;
  v_last_name text;
  v_display_name text;
  v_is_first boolean;
begin
  select id into v_family_id from families order by created_at asc limit 1;
  if v_family_id is null then
    insert into families (name) values ('SIAN Family') returning id into v_family_id;
  end if;

  v_first_name := coalesce(new.raw_user_meta_data->>'first_name', split_part(new.email, '@', 1));
  v_last_name := coalesce(new.raw_user_meta_data->>'last_name', '');
  v_display_name := coalesce(new.raw_user_meta_data->>'display_name', trim(v_first_name || ' ' || v_last_name));

  insert into profiles (auth_user_id, first_name, last_name, display_name, email)
  values (new.id, v_first_name, v_last_name, v_display_name, new.email)
  returning id into v_profile_id;

  select not exists (select 1 from family_memberships where family_id = v_family_id) into v_is_first;

  insert into family_memberships (family_id, profile_id, role, status)
  values (v_family_id, v_profile_id, case when v_is_first then 'owner' else 'member' end, 'active');

  return new;
end;
$$;

create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
