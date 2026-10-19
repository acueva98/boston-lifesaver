-- Boston Lifesaver: "Forgot password?" support. Run once in Supabase → SQL Editor. Safe to re-run.
-- Logins use username@users.cambridge-eats.app placeholder emails, so a reset link has to go to a
-- separate, private recovery email. The send-reset Edge Function reads it with the service role.

-- Recovery email per account: only the owner can see or change it (nobody else, not even signed-in users)
create table if not exists public.recovery_emails (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at timestamptz not null default now()
);
alter table public.recovery_emails enable row level security;
drop policy if exists "Read own recovery email" on public.recovery_emails;
drop policy if exists "Add own recovery email" on public.recovery_emails;
drop policy if exists "Change own recovery email" on public.recovery_emails;
drop policy if exists "Remove own recovery email" on public.recovery_emails;
create policy "Read own recovery email" on public.recovery_emails for select to authenticated using (user_id = auth.uid());
create policy "Add own recovery email" on public.recovery_emails for insert to authenticated with check (user_id = auth.uid());
create policy "Change own recovery email" on public.recovery_emails for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Remove own recovery email" on public.recovery_emails for delete to authenticated using (user_id = auth.uid());
revoke all on public.recovery_emails from anon;
grant select, insert, update, delete on public.recovery_emails to authenticated;

-- Log of reset emails sent, so the function can limit them (3 per account per hour). Service role only.
create table if not exists public.reset_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists reset_requests_user_idx on public.reset_requests (user_id, created_at desc);
alter table public.reset_requests enable row level security;   -- no policies: the public API can't read or write it
revoke all on public.reset_requests from anon, authenticated;
