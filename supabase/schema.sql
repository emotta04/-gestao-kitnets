create extension if not exists pgcrypto;

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  unit_name text not null,
  tenant_name text not null,
  phone text not null default '',
  residents integer not null check (residents > 0),
  rent_amount numeric(12,2) not null check (rent_amount >= 0),
  due_day integer not null check (due_day between 1 and 28),
  contract_number text not null default '',
  contract_start date,
  contract_end date,
  contract_url text,
  status text not null default 'ativa' check (status in ('ativa', 'inativa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.utility_periods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  water_total numeric(12,2) not null default 0 check (water_total >= 0),
  electricity_total numeric(12,2) not null default 0 check (electricity_total >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, month)
);

create table if not exists public.rent_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  paid_at date,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pago' check (status in ('pago', 'pendente')),
  created_at timestamptz not null default now(),
  unique (unit_id, month)
);

alter table public.units enable row level security;
alter table public.utility_periods enable row level security;
alter table public.rent_payments enable row level security;

create policy "Owners manage their units" on public.units
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners manage their utility periods" on public.utility_periods
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners manage their rent payments" on public.rent_payments
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.units
      where units.id = rent_payments.unit_id
        and units.owner_id = (select auth.uid())
    )
  );

create index if not exists units_owner_status_idx on public.units (owner_id, status);
create index if not exists rent_payments_owner_month_idx on public.rent_payments (owner_id, month);
