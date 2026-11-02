-- Run after schema.sql. Replace the email below with the existing administrator account.
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'tenant')),
  unit_id uuid unique references public.units(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_profiles_role_unit_check check (
    (role = 'admin' and unit_id is null) or (role = 'tenant' and unit_id is not null)
  )
);

create unique index if not exists user_profiles_email_lower_idx on public.user_profiles (lower(email));

alter table public.user_profiles enable row level security;

create or replace function public.is_app_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.current_tenant_unit_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.unit_id from public.user_profiles p
  where p.user_id = auth.uid() and p.role = 'tenant'
  limit 1;
$$;

create or replace function public.current_tenant_owner_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select u.owner_id
  from public.units u
  where u.id = public.current_tenant_unit_id()
  limit 1;
$$;

create or replace function public.current_property_resident_count()
returns integer
language sql stable security definer
set search_path = ''
as $$
  select coalesce(sum(u.residents), 0)::integer
  from public.units u
  where u.owner_id = coalesce(
    (select p.user_id from public.user_profiles p where p.user_id = auth.uid() and p.role = 'admin'),
    public.current_tenant_owner_id()
  )
  and u.status = 'ativa';
$$;

grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.current_tenant_unit_id() to authenticated;
grant execute on function public.current_tenant_owner_id() to authenticated;
grant execute on function public.current_property_resident_count() to authenticated;

-- Profiles are read-only to signed-in users; Edge Functions use the service role to invite/link tenants.
drop policy if exists "Users read own profile or admin reads all" on public.user_profiles;
create policy "Users read own profile or admin reads all" on public.user_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

-- Replace the original owner-only policies with role-aware access.
drop policy if exists "Owners manage their units" on public.units;
drop policy if exists "Admin manages property units" on public.units;
create policy "Admin manages property units" on public.units
  for all to authenticated
  using (public.is_app_admin() and owner_id = auth.uid())
  with check (public.is_app_admin() and owner_id = auth.uid());
drop policy if exists "Tenant reads assigned unit" on public.units;
create policy "Tenant reads assigned unit" on public.units
  for select to authenticated
  using (id = public.current_tenant_unit_id());

 drop policy if exists "Owners manage their utility periods" on public.utility_periods;
drop policy if exists "Admin manages utility periods" on public.utility_periods;
create policy "Admin manages utility periods" on public.utility_periods
  for all to authenticated
  using (public.is_app_admin() and owner_id = auth.uid())
  with check (public.is_app_admin() and owner_id = auth.uid());
drop policy if exists "Tenant reads property utility periods" on public.utility_periods;
create policy "Tenant reads property utility periods" on public.utility_periods
  for select to authenticated
  using (owner_id = public.current_tenant_owner_id());

drop policy if exists "Owners manage their rent payments" on public.rent_payments;
drop policy if exists "Admin manages rent payments" on public.rent_payments;
create policy "Admin manages rent payments" on public.rent_payments
  for all to authenticated
  using (public.is_app_admin() and owner_id = auth.uid())
  with check (
    public.is_app_admin()
    and owner_id = auth.uid()
    and exists (
      select 1 from public.units u
      where u.id = rent_payments.unit_id and u.owner_id = auth.uid()
    )
  );
drop policy if exists "Tenant reads own rent payments" on public.rent_payments;
create policy "Tenant reads own rent payments" on public.rent_payments
  for select to authenticated
  using (unit_id = public.current_tenant_unit_id());

-- Promote the existing owner account. Replace this placeholder before running this file.
insert into public.user_profiles (user_id, email, role, unit_id)
select id, email, 'admin', null
from auth.users
where lower(email) = lower('soxautomacao@gmail.com')
on conflict (user_id) do update
set email = excluded.email, role = 'admin', unit_id = null;
