-- ══════════════════════════════════════════════════════
-- Canopi — Supabase Schema
-- Run this in Supabase → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════

-- User preferences (weight sliders from UserPriorityPanel)
create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  w_schools int default 5 check (w_schools between 0 and 10),
  w_groceries int default 5 check (w_groceries between 0 and 10),
  w_restaurants int default 5 check (w_restaurants between 0 and 10),
  w_cafes int default 5 check (w_cafes between 0 and 10),
  w_parks int default 5 check (w_parks between 0 and 10),
  w_pharmacies int default 5 check (w_pharmacies between 0 and 10),
  w_transit int default 5 check (w_transit between 0 and 10),
  max_rent int default 3200,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Bookmarked/saved listings
create table public.saved_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  listing_id text not null,
  created_at timestamptz default now(),
  unique(user_id, listing_id)
);

-- Chat history
create table public.chat_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  messages jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Row Level Security ──
alter table public.user_preferences enable row level security;
alter table public.saved_listings enable row level security;
alter table public.chat_history enable row level security;

-- Users can only access their own data
create policy "Users read own preferences" on public.user_preferences
  for select using (auth.uid() = user_id);
create policy "Users insert own preferences" on public.user_preferences
  for insert with check (auth.uid() = user_id);
create policy "Users update own preferences" on public.user_preferences
  for update using (auth.uid() = user_id);

create policy "Users read own saved listings" on public.saved_listings
  for select using (auth.uid() = user_id);
create policy "Users insert own saved listings" on public.saved_listings
  for insert with check (auth.uid() = user_id);
create policy "Users delete own saved listings" on public.saved_listings
  for delete using (auth.uid() = user_id);

create policy "Users read own chat history" on public.chat_history
  for select using (auth.uid() = user_id);
create policy "Users upsert own chat history" on public.chat_history
  for insert with check (auth.uid() = user_id);
create policy "Users update own chat history" on public.chat_history
  for update using (auth.uid() = user_id);
