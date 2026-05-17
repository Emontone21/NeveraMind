-- Migration: add expires_at to inventory_items
-- Run in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- or via `supabase db push` if you have the local CLI set up.
--
-- Safe to run multiple times — uses IF NOT EXISTS guards.

alter table inventory_items
  add column if not exists expires_at date;

-- Partial index: we only care about expiry for items currently in the fridge.
-- Speeds up the "expiring soon" query in the Inventory page.
create index if not exists idx_inventory_expires_disponible
  on inventory_items (expires_at)
  where status = 'disponible' and expires_at is not null;

comment on column inventory_items.expires_at is
  'Fecha de vencimiento estimada. Null = sin fecha. Tipo date (sin hora) — usamos UTC midnight implícito.';
