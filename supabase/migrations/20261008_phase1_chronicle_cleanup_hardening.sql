-- Phase 1: day chronicle, retention cleanup, RPC hardening.

-- 1) Day chronicle ---------------------------------------------------------
create table if not exists public.day_chronicle (
  day integer primary key check (day >= 1),
  season text not null default 'spring',
  summary text not null default '',
  highlights jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  first_tick bigint not null,
  last_tick bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.day_chronicle enable row level security;
drop policy if exists "public read chronicle" on public.day_chronicle;
create policy "public read chronicle" on public.day_chronicle
  for select to anon, authenticated using (true);

do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'day_chronicle') then
    alter publication supabase_realtime add table public.day_chronicle;
  end if;
end $$;

-- 2) Retention cleanup -----------------------------------------------------
create or replace function public.cleanup_the_nine()
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_mem int := 0; v_ev int := 0; v_runs int := 0; v_rel int := 0;
begin
  -- Keep the newest 150 memories per resident, plus important ones from the last 30 days.
  with ranked as (
    select id, importance, created_at,
           row_number() over (partition by character_id order by created_at desc) rn
    from public.memories
  )
  delete from public.memories m using ranked r
  where m.id = r.id and r.rn > 150
    and not (r.importance >= 0.7 and r.created_at > now() - interval '30 days');
  get diagnostics v_mem = row_count;

  -- The day chronicle preserves history, so raw events can expire.
  delete from public.world_events where created_at < now() - interval '14 days';
  get diagnostics v_ev = row_count;

  delete from public.simulation_runs
  where started_at < now() - interval '7 days' and status <> 'running';
  get diagnostics v_runs = row_count;

  -- Relationship history grows on every interaction; keep the latest 30 entries.
  update public.relationships r
  set history = (
    select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
    from (select e, i from jsonb_array_elements(r.history) with ordinality t(e, i)
          order by i desc limit 30) s)
  where jsonb_array_length(r.history) > 30;
  get diagnostics v_rel = row_count;

  return jsonb_build_object('memories', v_mem, 'world_events', v_ev,
                            'simulation_runs', v_runs, 'relationships_trimmed', v_rel);
end;
$$;

-- 3) Lock RPCs to the server. The runner uses the service role; the browser
--    only needs read access through RLS-protected tables.
revoke execute on function public.cleanup_the_nine() from public, anon, authenticated;
revoke execute on function public.advance_world_tick(bigint) from public, anon, authenticated;
revoke execute on function public.apply_social_event(uuid, uuid, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.apply_world_action(uuid, text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_simulation_lease(text) from public, anon, authenticated;
revoke execute on function public.try_acquire_simulation_lease(text, integer) from public, anon, authenticated;
grant execute on function public.cleanup_the_nine() to service_role;
grant execute on function public.advance_world_tick(bigint) to service_role;
grant execute on function public.apply_social_event(uuid, uuid, numeric, numeric, numeric, numeric) to service_role;
grant execute on function public.apply_world_action(uuid, text, uuid, integer) to service_role;
grant execute on function public.release_simulation_lease(text) to service_role;
grant execute on function public.try_acquire_simulation_lease(text, integer) to service_role;

-- 4) Schedule cleanup daily at 03:15 UTC.
select cron.unschedule('the-nine-cleanup') where exists (select 1 from cron.job where jobname = 'the-nine-cleanup');
select cron.schedule('the-nine-cleanup', '15 3 * * *', $cron$select public.cleanup_the_nine();$cron$);
