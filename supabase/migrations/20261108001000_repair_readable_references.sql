begin;
-- Repair partially applied setups without changing UUIDs or existing short references.
alter table public.groups add column if not exists display_number bigint generated always as identity unique;
alter table public.groups add column if not exists display_id text generated always as ('G-' || display_number::text) stored unique;
alter table public.players add column if not exists display_number bigint generated always as identity unique;
alter table public.players add column if not exists display_id text generated always as ('P-' || display_number::text) stored unique;
notify pgrst, 'reload schema';
commit;
