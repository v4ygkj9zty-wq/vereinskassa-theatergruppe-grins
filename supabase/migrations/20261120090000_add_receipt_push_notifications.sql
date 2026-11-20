create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

create policy push_subscriptions_own_select on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy push_subscriptions_own_insert on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy push_subscriptions_own_update on public.push_subscriptions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

create table if not exists public.receipt_push_queue (
  receipt_id uuid primary key references public.receipts(id) on delete cascade,
  queued_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.receipt_push_queue enable row level security;
revoke all on table public.receipt_push_queue from anon, authenticated;

create table if not exists public.receipt_push_deliveries (
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','stale')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (receipt_id, subscription_id)
);
alter table public.receipt_push_deliveries enable row level security;
revoke all on table public.receipt_push_deliveries from anon, authenticated;

create or replace function public.queue_receipt_push_after_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.receipts r
    where r.id = new.receipt_id and r.status = 'submitted'::public.receipt_status
  ) then
    insert into public.receipt_push_queue(receipt_id)
    values (new.receipt_id)
    on conflict (receipt_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.queue_receipt_push_after_file() from public, anon, authenticated;

create trigger receipt_files_queue_push
after insert on public.receipt_files
for each row execute function public.queue_receipt_push_after_file();

create or replace function public.get_push_vapid_private_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'receipt_push_vapid_private_key'
  limit 1
$$;
revoke all on function public.get_push_vapid_private_key() from public, anon, authenticated;
grant execute on function public.get_push_vapid_private_key() to service_role;

grant all on table public.push_subscriptions, public.receipt_push_queue, public.receipt_push_deliveries to service_role;


