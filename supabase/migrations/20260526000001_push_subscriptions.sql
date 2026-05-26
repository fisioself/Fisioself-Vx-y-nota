-- Migration: Push Notifications Subscriptions
-- Description: Creates a table to store Web Push API subscriptions for users to receive alerts about their appointments.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

-- Policy: Users can insert their own subscriptions
create policy "Users can manage their own push subscriptions"
on public.push_subscriptions
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Add updated_at trigger
create trigger update_push_subscriptions_modtime
before update on public.push_subscriptions
for each row execute procedure update_updated_at_column();
