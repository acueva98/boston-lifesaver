-- Boston Lifesaver: restaurants + deals tables (already applied to the team Supabase project on Oct 13, 2026).
-- Kept here as a record. To rebuild a fresh project: run setup.sql first, then this file, then load the data.

create table public.restaurants (
  id            integer primary key check (id > 0),
  name          text not null,
  neighborhood  text not null,
  cuisine       text not null default '',
  address       text not null default '',
  zip           text check (zip ~ '^\d{5}$'),
  price_range   text not null check (price_range in ('$','$$','$$$','$$$$')),
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  source        text not null default '',          -- page used to confirm the restaurant exists
  is_closed     boolean not null default false,
  closed_source text,
  deal_check    text not null default 'unchecked' check (deal_check in ('unchecked','deals','none')),
  deal_notes    text not null default '',          -- what was found when checking for deals
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.deals (
  id            bigint generated always as identity primary key,
  restaurant_id integer not null references public.restaurants(id) on delete cascade,
  type          text not null check (type in ('happy-hour','lunch','prix-fixe','weekly-special','late-night','discount','rewards')),
  description   text not null check (char_length(description) between 3 and 500),
  source_url    text not null check (source_url ~ '^https?://'),
  source_date   text,                               -- e.g. '2025-05' or 'current site'
  -- 'sourced' = found on a public source, not yet checked by the team
  -- 'verified' = a team member confirmed it (fill verified_by + verified_at)
  -- 'rejected' = wrong or expired (hidden from the site)
  status        text not null default 'sourced' check (status in ('sourced','verified','rejected')),
  verified_by   text,
  verified_at   date,
  days_of_week  smallint[] check (days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]),  -- 0 = Sunday
  start_time    time,
  end_time      time,
  valid_from    date,
  valid_to      date check (valid_to is null or valid_from is null or valid_to >= valid_from),
  last_checked  date not null default current_date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (status <> 'verified' or (verified_by is not null and verified_at is not null))
);
create index deals_restaurant_id_idx on public.deals (restaurant_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger restaurants_touch before update on public.restaurants for each row execute function public.touch_updated_at();
create trigger deals_touch before update on public.deals for each row execute function public.touch_updated_at();

-- Public site can only read; edits happen in the Supabase dashboard.
alter table public.restaurants enable row level security;
alter table public.deals enable row level security;
create policy "Restaurants are public" on public.restaurants for select to anon, authenticated using (true);
create policy "Live deals are public" on public.deals for select to anon, authenticated using (status in ('sourced','verified'));
grant select on public.restaurants, public.deals to anon, authenticated;
revoke insert, update, delete, truncate on public.restaurants, public.deals from anon, authenticated;

-- Reviews must point at a real restaurant.
alter table public.reviews
  add constraint reviews_restaurant_id_fkey foreign key (restaurant_id) references public.restaurants(id) on delete cascade;
create index if not exists reviews_restaurant_id_idx on public.reviews (restaurant_id);
