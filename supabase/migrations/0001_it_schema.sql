-- ============================================================================
-- 0001_it_schema.sql
-- IT asset inventory: regions -> employees -> photos
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists it_regions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists it_employees (
  id          uuid primary key default gen_random_uuid(),
  region_id   uuid not null references it_regions(id) on delete restrict,
  full_name   text not null,
  created_at  timestamptz not null default now(),
  unique (region_id, full_name)
);

create index if not exists it_employees_region_id_idx on it_employees(region_id);

create table if not exists it_employee_photos (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references it_employees(id) on delete cascade,
  storage_path   text not null unique,
  file_name      text not null,
  uploaded_by    uuid references auth.users(id) on delete set null,
  uploaded_at    timestamptz not null default now()
);

create index if not exists it_employee_photos_employee_id_idx on it_employee_photos(employee_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- NOTE: Auth is not enabled yet for this app (per product decision — will be
-- added later). Until then, these policies allow open read/write to the
-- three tables below so the app functions without a login screen.
--
-- IMPORTANT: once auth is added, replace the "it_open_*" policies with
-- policies scoped to `auth.role() = 'authenticated'` (or more granular
-- per-role rules), and remove anonymous access. Do not leave this app on
-- open policies once it is reachable outside a trusted network.
-- ----------------------------------------------------------------------------

alter table it_regions enable row level security;
alter table it_employees enable row level security;
alter table it_employee_photos enable row level security;

create policy it_open_select_regions on it_regions
  for select using (true);
create policy it_open_write_regions on it_regions
  for all using (true) with check (true);

create policy it_open_select_employees on it_employees
  for select using (true);
create policy it_open_write_employees on it_employees
  for all using (true) with check (true);

create policy it_open_select_photos on it_employee_photos
  for select using (true);
create policy it_open_write_photos on it_employee_photos
  for all using (true) with check (true);

-- ----------------------------------------------------------------------------
-- Storage bucket for employee photos
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('it-photos', 'it-photos', false)
on conflict (id) do nothing;

-- Matching open policies for the bucket (see NOTE above — tighten once auth
-- is added, e.g. restrict to `auth.role() = 'authenticated'`).
create policy it_open_storage_select on storage.objects
  for select using (bucket_id = 'it-photos');
create policy it_open_storage_insert on storage.objects
  for insert with check (bucket_id = 'it-photos');
create policy it_open_storage_delete on storage.objects
  for delete using (bucket_id = 'it-photos');
