create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);
create index if not exists receipt_push_deliveries_subscription_id_idx
  on public.receipt_push_deliveries(subscription_id);

alter function public.set_updated_at() set search_path = '';
alter function public.normalize_profile_iban() set search_path = '';

revoke all on function public.mark_internal_transfer_pairs() from public, anon, authenticated;

