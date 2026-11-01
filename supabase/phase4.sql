-- =====================================================================
-- Nexaro Phase 4: stores, products, product images and image storage
--
-- Run this AFTER schema.sql (it uses profiles, store_applications and
-- is_admin() from there). Open the SQL Editor on supabase.com, paste the
-- whole file and click "Run". It is safe to run again later.
--
-- What it creates:
--   1. stores            one row per approved store (created automatically)
--   2. products          what stores sell (draft → pending → published)
--   3. product_images    up to 5 photos per product, in order
--   4. a storage bucket  "product-images" for the photo files
--   5. Row Level Security for all of it
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. STORES
-- One store per owner ("unique"). Deleting the owner deletes the store,
-- and deleting a store deletes its products ("on delete cascade").
-- slug = the store's web address: nexaro.ps/store/<slug>
-- ---------------------------------------------------------------------
create table if not exists public.stores (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  city        text check (char_length(city) <= 60),
  description text check (char_length(description) <= 1000),
  instagram   text check (char_length(instagram) <= 120),
  whatsapp    text check (char_length(whatsapp) <= 30),
  logo_url    text check (char_length(logo_url) <= 500),
  verified    boolean not null default false,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2. make_store_slug(): a unique web address from the store name
-- "Khuyoot Store" → "khuyoot-store". Arabic names have no Latin letters,
-- so they get "store-" + 6 random characters (e.g. store-a3f9c1).
-- If the address is taken (or reserved), it adds -2, -3, ...
-- You can always change a slug later in the Table Editor.
-- ---------------------------------------------------------------------
create or replace function public.make_store_slug(store_name text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  reserved text[] := array['dashboard', 'new', 'edit', 'admin',
                           'dar-alrajul', 'khuyoot', 'aseel', 'siraj', 'marj', 'waha']; -- demo stores
  base text := trim(both '-' from regexp_replace(lower(coalesce(store_name, '')), '[^a-z0-9]+', '-', 'g'));
  candidate text;
  n int := 1;
begin
  if char_length(base) < 3 then
    base := 'store-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  end if;
  base := trim(both '-' from left(base, 50));
  candidate := base;
  while candidate = any (reserved) or exists (select 1 from public.stores where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. TRIGGER: approving an application creates the store
-- When an admin approves (status → 'approved'), the store row is made from
-- the application: name, city, description, Instagram, and the phone as
-- the store's WhatsApp. The owner becomes a 'store' (an admin stays admin).
-- ---------------------------------------------------------------------
create or replace function public.create_store_on_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.stores (owner_id, name, slug, city, description, instagram, whatsapp)
    values (new.user_id, new.store_name, public.make_store_slug(new.store_name),
            new.city, new.description, new.instagram, new.phone)
    on conflict (owner_id) do nothing;   -- already has a store: keep it

    update public.profiles set role = 'store'
    where id = new.user_id and role = 'customer';
  end if;
  return new;
end;
$$;

drop trigger if exists store_applications_create_store on public.store_applications;
create trigger store_applications_create_store
  after update of status on public.store_applications
  for each row execute function public.create_store_on_approval();

-- Applications approved before this file was run get their store now
do $$
declare app record;
begin
  for app in
    select distinct on (a.user_id) a.*
    from public.store_applications a
    where a.status = 'approved'
      and not exists (select 1 from public.stores s where s.owner_id = a.user_id)
    order by a.user_id, a.created_at desc
  loop
    insert into public.stores (owner_id, name, slug, city, description, instagram, whatsapp)
    values (app.user_id, app.store_name, public.make_store_slug(app.store_name),
            app.city, app.description, app.instagram, app.phone);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. TRIGGER: what a store owner may change on their store
-- Owners may edit the logo, description, Instagram and WhatsApp.
-- The name, address (slug), city, owner and the verified badge are
-- changed only by an admin (or by you in the SQL Editor).
-- ---------------------------------------------------------------------
create or replace function public.protect_store_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if new.owner_id is distinct from old.owner_id
       or new.name is distinct from old.name
       or new.slug is distinct from old.slug
       or new.city is distinct from old.city
       or new.verified is distinct from old.verified
       or new.created_at is distinct from old.created_at then
      raise exception 'Only an admin can change the store name, address, city or verified badge'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists stores_protect_columns on public.stores;
create trigger stores_protect_columns
  before update on public.stores
  for each row execute function public.protect_store_columns();


-- ---------------------------------------------------------------------
-- 5. owns_store(): "does the logged-in user own this store?"
-- True only for the store's owner, and only while their role is still
-- 'store' (or 'admin'). Used by the rules below.
-- ---------------------------------------------------------------------
create or replace function public.owns_store(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stores s
    join public.profiles p on p.id = s.owner_id
    where s.id = target_store
      and s.owner_id = auth.uid()
      and p.role in ('store', 'admin')
  );
$$;

-- Same check for a storage folder name ("<store id>/photo.webp")
create or replace function public.owns_store_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stores s
    join public.profiles p on p.id = s.owner_id
    where s.id::text = folder
      and s.owner_id = auth.uid()
      and p.role in ('store', 'admin')
  );
$$;


-- ---------------------------------------------------------------------
-- 6. PRODUCTS
-- price NULL = "السعر عند الطلب" (price on request).
-- compare_at_price = the old price, shown crossed out.
-- status: draft (only the store sees it) → pending (waiting for an admin)
--         → published (everyone sees it) or rejected (with a reason).
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores (id) on delete cascade,
  name_ar           text check (char_length(name_ar) <= 120),
  name_en           text check (char_length(name_en) <= 120),
  description_ar    text check (char_length(description_ar) <= 2000),
  description_en    text check (char_length(description_en) <= 2000),
  section           text check (section in ('men', 'women', 'kids')),
  category          text check (char_length(category) <= 40),
  price             numeric(10, 2) check (price >= 0),
  compare_at_price  numeric(10, 2) check (compare_at_price >= 0),
  sizes             text[] not null default '{}',
  colors            text[] not null default '{}',
  made_in_palestine boolean not null default false,
  occasions         text[] not null default '{}'
                    check (occasions <@ array['wedding', 'university', 'eid', 'work', 'casual']),
  status            text not null default 'draft'
                    check (status in ('draft', 'pending', 'published', 'rejected')),
  review_note       text check (char_length(review_note) <= 300), -- the admin's reason when rejecting
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint products_has_a_name check (coalesce(name_ar, '') <> '' or coalesce(name_en, '') <> '')
);

create index if not exists products_store_id_idx on public.products (store_id);
create index if not exists products_status_idx on public.products (status);


-- ---------------------------------------------------------------------
-- 7. TRIGGER: keep updated_at current, and protect the admin's note
-- Only an admin writes review_note. When a store sends a product for
-- review again, the old rejection reason is cleared.
-- ---------------------------------------------------------------------
create or replace function public.before_product_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.review_note := null;
    elsif new.status = 'pending' and old.status is distinct from 'pending' then
      new.review_note := null;          -- resubmitted: the old reason no longer applies
    else
      new.review_note := old.review_note;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_before_write on public.products;
create trigger products_before_write
  before insert or update on public.products
  for each row execute function public.before_product_write();


-- ---------------------------------------------------------------------
-- 8. PRODUCT IMAGES (up to 5 per product, ordered by position 0–4)
-- url = the public address of the file in the "product-images" bucket.
-- ---------------------------------------------------------------------
create table if not exists public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url        text not null check (url ~ '^https://' and char_length(url) <= 500),
  position   int not null default 0 check (position between 0 and 4),
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_id_idx on public.product_images (product_id);

create or replace function public.limit_product_images()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.product_images where product_id = new.product_id) >= 5 then
    raise exception 'A product can have at most 5 images' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists product_images_limit on public.product_images;
create trigger product_images_limit
  before insert on public.product_images
  for each row execute function public.limit_product_images();


-- ---------------------------------------------------------------------
-- 9. STORAGE BUCKET for the photo files
-- public = anyone can view a photo by its address (needed for the shop).
-- Max 3 MB per file; WebP, JPEG or PNG only. The dashboard shrinks
-- photos to WebP (max 1600px) before uploading, so they are much smaller.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ---------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY
-- Same idea as schema.sql: nothing is allowed unless a rule says so.
-- ---------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;

-- STORES --------------------------------------------------------------
drop policy if exists "Anyone can read stores" on public.stores;
create policy "Anyone can read stores"
  on public.stores for select
  to anon, authenticated
  using (true);

drop policy if exists "Owners can update their store" on public.stores;
create policy "Owners can update their store"
  on public.stores for update
  to authenticated
  using (public.owns_store(id))
  with check (public.owns_store(id));
  -- (which columns they may change is decided by the trigger in step 4)

drop policy if exists "Admins can manage stores" on public.stores;
create policy "Admins can manage stores"
  on public.stores for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- New stores are created only by the approval trigger (or an admin).

-- PRODUCTS ------------------------------------------------------------
drop policy if exists "Anyone can read published products" on public.products;
create policy "Anyone can read published products"
  on public.products for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "Owners can read their products" on public.products;
create policy "Owners can read their products"
  on public.products for select
  to authenticated
  using (public.owns_store(store_id));

-- An owner can only save 'draft' or 'pending'. Never 'published':
-- only an admin publishes. So editing a published product sends it back
-- to review (the dashboard saves it as pending or draft).
drop policy if exists "Owners can add products" on public.products;
create policy "Owners can add products"
  on public.products for insert
  to authenticated
  with check (public.owns_store(store_id) and status in ('draft', 'pending'));

drop policy if exists "Owners can edit their products" on public.products;
create policy "Owners can edit their products"
  on public.products for update
  to authenticated
  using (public.owns_store(store_id))
  with check (public.owns_store(store_id) and status in ('draft', 'pending'));

drop policy if exists "Owners can delete their products" on public.products;
create policy "Owners can delete their products"
  on public.products for delete
  to authenticated
  using (public.owns_store(store_id));

drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products"
  on public.products for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- PRODUCT IMAGES ------------------------------------------------------
drop policy if exists "Anyone can read images of published products" on public.product_images;
create policy "Anyone can read images of published products"
  on public.product_images for select
  to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));

drop policy if exists "Owners can manage their product images" on public.product_images;
create policy "Owners can manage their product images"
  on public.product_images for all
  to authenticated
  using (exists (select 1 from public.products p where p.id = product_id and public.owns_store(p.store_id)))
  with check (exists (select 1 from public.products p where p.id = product_id and public.owns_store(p.store_id)));

drop policy if exists "Admins can manage product images" on public.product_images;
create policy "Admins can manage product images"
  on public.product_images for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- STORAGE (the photo files) ---------------------------------------------
-- Files are named "<store id>/<anything>.webp". storage.foldername(name)[1]
-- is that first folder, so an owner can only touch files of their own store.
drop policy if exists "Product images are public" on storage.objects;
create policy "Product images are public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Store owners upload to their own folder" on storage.objects;
create policy "Store owners upload to their own folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.owns_store_folder((storage.foldername(name))[1]));

drop policy if exists "Store owners update files in their own folder" on storage.objects;
create policy "Store owners update files in their own folder"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and public.owns_store_folder((storage.foldername(name))[1]))
  with check (bucket_id = 'product-images' and public.owns_store_folder((storage.foldername(name))[1]));

drop policy if exists "Store owners delete files in their own folder" on storage.objects;
create policy "Store owners delete files in their own folder"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and public.owns_store_folder((storage.foldername(name))[1]));

drop policy if exists "Admins manage all product image files" on storage.objects;
create policy "Admins manage all product image files"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());


-- ---------------------------------------------------------------------
-- 11. OPTIONAL: give a store the verified badge (run by hand)
-- Remove the dashes, put the store's address, select the line, click Run.
-- ---------------------------------------------------------------------
-- update public.stores set verified = true where slug = 'store-address-here';
