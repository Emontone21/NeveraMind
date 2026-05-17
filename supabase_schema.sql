-- Run this in your Supabase SQL Editor
-- https://supabase.com/dashboard → your project → SQL Editor

create table if not exists inventory_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  quantity    numeric not null default 1,
  unit        text not null default 'unidades',
  status      text not null default 'disponible'
                check (status in ('disponible', 'consumido')),
  expires_at  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index for fast name lookups (used for upsert matching)
create index if not exists idx_inventory_name on inventory_items (lower(name));

-- Partial index for the "expiring soon" Inventory section
create index if not exists idx_inventory_expires_disponible
  on inventory_items (expires_at)
  where status = 'disponible' and expires_at is not null;

-- Auto-update updated_at on row changes
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger inventory_items_updated_at
  before update on inventory_items
  for each row execute function update_updated_at();

-- Enable RLS (Row Level Security) — single-user app, allow all for anon
alter table inventory_items enable row level security;

create policy "Allow all for anon"
  on inventory_items
  for all
  to anon
  using (true)
  with check (true);
