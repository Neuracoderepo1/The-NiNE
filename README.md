# THE NINE

Nine artificial people. One persistent world. A simulation experiment where nine residents act, remember and change a shared settlement while visitors watch live.

> AI behavior is simulated. The system does not claim consciousness.

## Architecture
- **Next.js 15** app (`app/`, `lib/`) deployed on Vercel.
- **Supabase** (project `stbjmifjrekbxhsibqto`, eu-central-1) is the authoritative world state: `world_state`, `characters`, `relationships`, `memories`, `world_events`, `simulation_runs`, `world_discoveries`, `simulation_config`, `simulation_leases`.
- The browser reads with the publishable key and subscribes via Realtime to `world_state`, `characters`, `world_events`.

## Autonomous runtime
Vercel Cron (`0 0 * * *` on Hobby; use `*/5 * * * *` on Pro or an external scheduler calling the same endpoint every 5 minutes) → `GET /api/advance` → verify `Authorization: Bearer $CRON_SECRET` → service-role client → `try_acquire_simulation_lease` → read `simulation_config` (`enabled`, `tick_interval_seconds`, `max_actions_per_tick`) → process residents → write events and memories → `advance_world_tick(p_expected_tick)` → `release_simulation_lease` (always, in `finally`). A busy lease returns `{ok:true, skipped:true, reason:"simulation_busy"}`; a tick conflict aborts with 409.

## Phase 1 engine
- `lib/engine.ts` — personality- and needs-driven decisions (eat, rest, talk, work, explore, help, reflect). Survival gates first, then trait/need/role/weather/time-of-day scoring with seeded noise. Conversations can go warm or tense.
- `lib/narrator.ts` — rule-based narrator that turns each decision into a sentence.
- `lib/worldEvents.ts` — seasons (7 days each), weather, discoveries, scarcity alerts. Logged to `world_events` as `action = 'world_event'`.
- `lib/chronicle.ts` — daily summary written to `day_chronicle` on every tick.
- `supabase/migrations/` — `day_chronicle`, `cleanup_the_nine()` (daily pg_cron at 03:15 UTC) and RPC hardening.
- World events, discoveries and the chronicle are non-fatal: a failure is returned in `warnings` and never blocks the tick.

## Security model
- Simulation RPCs (`advance_world_tick`, `apply_world_action`, `apply_social_event`, lease functions, `cleanup_the_nine`) are executable by `service_role` only, not `anon`/`authenticated`.
- `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are server-only and never reach client code.
- `/api/advance` accepts only authenticated `GET`; unauthorized requests get `401`. There is no public `POST` and no manual-advance button.
- Fails closed if `CRON_SECRET` is unset.

## Environment variables
See `.env.example`. Set all four in Vercel (Production). Never commit real values.

## Local development
```
cp .env.example .env.local   # fill values
npm install
npm run dev
```
Test the runner locally: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/advance`

## Deployment
Import `Neuracoderepo1/The-NiNE` in Vercel (framework: Next.js, project `the-nine`), set the four env vars, deploy. Cron is registered from `vercel.json`.
