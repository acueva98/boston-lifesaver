-- Cambridge Eats: accounts, reviews and food photos.
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.

-- ---------- Profiles (one per account; holds the public username) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Profiles are public" on public.profiles;
create policy "Profiles are public" on public.profiles for select using (true);

-- Create the profile automatically when someone signs up (username comes from sign-up metadata)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(new.raw_user_meta_data ->> 'username'));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Reviews (one per person per restaurant; editable) ----------
create table if not exists public.reviews (
  id bigint generated always as identity primary key,
  restaurant_id int not null check (restaurant_id > 0),   -- matches the id column in data/restaurants.json
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1000),
  photos text[] not null default '{}' check (cardinality(photos) <= 3),  -- storage paths in the food-photos bucket
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);
create index if not exists reviews_restaurant_idx on public.reviews (restaurant_id, created_at desc);
alter table public.reviews enable row level security;
drop policy if exists "Reviews are public" on public.reviews;
drop policy if exists "Write own review" on public.reviews;
drop policy if exists "Edit own review" on public.reviews;
drop policy if exists "Delete own review" on public.reviews;
create policy "Reviews are public" on public.reviews for select using (true);
create policy "Write own review" on public.reviews for insert to authenticated with check (user_id = auth.uid());
create policy "Edit own review" on public.reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Delete own review" on public.reviews for delete to authenticated using (user_id = auth.uid());

-- Explicit API access (row-level security above still decides which rows)
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;

-- Average rating + count per restaurant, for the list
create or replace view public.restaurant_stats with (security_invoker = true) as
  select restaurant_id, round(avg(rating)::numeric, 1)::float as avg_rating, count(*)::int as review_count
  from public.reviews group by restaurant_id;
grant select on public.restaurant_stats to anon, authenticated;

-- ---------- Food photos (public bucket; each user may only write inside their own folder) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-photos', 'food-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Food photos are public" on storage.objects;
drop policy if exists "Upload own food photos" on storage.objects;
drop policy if exists "Delete own food photos" on storage.objects;
create policy "Food photos are public" on storage.objects for select
  using (bucket_id = 'food-photos');
create policy "Upload own food photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Delete own food photos" on storage.objects for delete to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);
