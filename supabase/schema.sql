-- =====================================================================
-- Nexaro: database schema for Supabase (Auth + Postgres)
--
-- How to use: open your project on supabase.com → SQL Editor → New query,
-- paste this whole file, and click "Run". It is safe to run again later:
-- every step checks whether it already exists.
--
-- What it creates:
--   1. profiles            one row per user (name, phone, city, role)
--   2. store_applications  stores asking to join Nexaro
--   3. is_admin()          a helper: "is the logged-in user an admin?"
--   4. triggers            create the profile on signup, protect the role
--   5. review_application() approve / reject in one safe step (admins only)
--   6. Row Level Security  the real protection: who can read / change what
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PROFILES
-- Supabase keeps logins (email, password) in its own table, auth.users.
-- We keep everything else about a person here, linked by the same id.
-- "on delete cascade": if a user is deleted, their profile goes too.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text check (char_length(full_name) <= 100),
  phone      text check (char_length(phone) <= 30),
  city       text check (char_length(city) <= 60),
  -- Every new account is a customer. Only an admin can change this.
  role       text not null default 'customer' check (role in ('customer', 'store', 'admin')),
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2. STORE APPLICATIONS
-- A store owner's request to join. It points to the owner's profile,
-- so the admin page can show the applicant's name next to the request.
-- ---------------------------------------------------------------------
create table if not exists public.store_applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  store_name  text not null check (char_length(store_name) between 2 and 80),
  city        text not null check (char_length(city) <= 60),
  phone       text not null check (char_length(phone) <= 30),
  instagram   text check (char_length(instagram) <= 120),
  description text check (char_length(description) <= 1000),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now()
);

-- Makes "find this user's applications" fast
create index if not exists store_applications_user_id_idx
  on public.store_applications (user_id);

-- A user can have only ONE pending application at a time (stops duplicates)
create unique index if not exists store_applications_one_pending_idx
  on public.store_applications (user_id) where status = 'pending';


-- ---------------------------------------------------------------------
-- 3. is_admin()
-- Returns true when the logged-in user's role is 'admin'.
-- auth.uid() = the id of whoever is making the request (null if nobody).
-- "security definer" lets it read profiles without being blocked by the
-- profiles rules below (otherwise those rules would call themselves forever).
-- "set search_path = ''" is a safety setting: every name is written in full.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;


-- ---------------------------------------------------------------------
-- 4a. TRIGGER: create a profile automatically on signup
-- When someone signs up, Supabase adds a row to auth.users. This runs
-- right after and creates their profile from the details sent with the
-- signup form (name, phone, city).
--
-- Store signups also send their store details. We create the store
-- application here too, because right after signup the user may not be
-- logged in yet (Supabase asks them to confirm their email first).
--
-- IMPORTANT: the role is NEVER read from the signup data. Anyone can send
-- anything to the signup form, so every new account starts as 'customer'.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, full_name, phone, city)
  values (
    new.id,
    left(meta ->> 'full_name', 100),
    left(meta ->> 'phone', 30),
    left(meta ->> 'city', 60)
  )
  on conflict (id) do nothing;

  -- Store signup: create the application (only if it has a real store name,
  -- so a bad value can never block the account itself from being created)
  if meta ->> 'account_type' = 'store'
     and char_length(trim(coalesce(meta ->> 'store_name', ''))) >= 2 then
    insert into public.store_applications (user_id, store_name, city, phone, instagram, description)
    values (
      new.id,
      left(trim(meta ->> 'store_name'), 80),
      coalesce(left(meta ->> 'city', 60), ''),
      coalesce(left(meta ->> 'phone', 30), ''),
      nullif(left(meta ->> 'instagram', 120), ''),
      nullif(left(meta ->> 'description', 1000), '')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts created before this file was run get a profile too
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 4b. TRIGGER: nobody can change their own role
-- Runs before every change to a profile. If the role is being changed by a
-- logged-in website user ('authenticated') who is not an admin, it stops.
-- Changes made by you in the SQL Editor, or by review_application() below,
-- are allowed (they don't run as a website user).
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and current_user in ('authenticated', 'anon')
     and not public.is_admin() then
    raise exception 'Only an admin can change a role'
      using errcode = '42501';  -- "insufficient privilege"
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();


-- ---------------------------------------------------------------------
-- 5. review_application(): approve or reject (admins only)
-- Does both steps together, so they can't get out of sync:
--   approved → application status = 'approved' AND the user's role = 'store'
--   rejected → application status = 'rejected' (the role is not changed)
-- It never downgrades an admin (approving an admin's test application
-- won't turn the admin into a store).
-- ---------------------------------------------------------------------
create or replace function public.review_application(application_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  applicant uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can review applications' using errcode = '42501';
  end if;
  if new_status not in ('approved', 'rejected') then
    raise exception 'Status must be approved or rejected' using errcode = '22023';
  end if;

  update public.store_applications
  set status = new_status
  where id = application_id
  returning user_id into applicant;

  if applicant is null then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  if new_status = 'approved' then
    update public.profiles set role = 'store'
    where id = applicant and role = 'customer';
  end if;
end;
$$;

-- Only logged-in users may call it (and inside, only admins get through)
revoke execute on function public.review_application(uuid, text) from public, anon;
grant execute on function public.review_application(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS)
-- With RLS on, the database refuses EVERY read and write unless a rule
-- ("policy") below allows it. This is the real protection: even if someone
-- skips the website and talks to the database directly with the public
-- anon key, they only get what these rules allow.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.store_applications enable row level security;

-- Visitors who are not logged in get nothing from these tables
revoke all on public.profiles, public.store_applications from anon;

-- PROFILES ------------------------------------------------------------
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
  -- (the role column is protected by the trigger in 4b)

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No insert or delete rules: profiles are created by the signup trigger
-- and removed automatically when the account is deleted.

-- STORE APPLICATIONS --------------------------------------------------
drop policy if exists "Users can create their own application" on public.store_applications;
create policy "Users can create their own application"
  on public.store_applications for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'pending');  -- no self-approval

drop policy if exists "Users can read their own applications" on public.store_applications;
create policy "Users can read their own applications"
  on public.store_applications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Admins can read all applications" on public.store_applications;
create policy "Admins can read all applications"
  on public.store_applications for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update applications" on public.store_applications;
create policy "Admins can update applications"
  on public.store_applications for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Users can't edit or delete an application after sending it.


-- ---------------------------------------------------------------------
-- 7. MAKE YOURSELF AN ADMIN (run once, after you have signed up)
-- Remove the two dashes at the start of the next line, put your email,
-- select just that line, and click "Run".
-- ---------------------------------------------------------------------
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
