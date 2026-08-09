-- 0004_email_token_replay_guard.sql
-- Make replayed Mailgun payloads collide on insert, and redact the signatures
-- already stored. Follow-up to issue #53 (PR #54 review).
--
-- WHY THIS EXISTS
-- #53 changed the email lane so a stale-but-validly-signed payload is STORED
-- (parsing_status 'skipped') rather than rejected with a 400. That fixed real data
-- loss, but it also removed the only thing that stopped a replayed payload from
-- writing a row. Since `posts` is the permanent ML corpus and is never purged, an
-- attacker holding one captured tuple could previously have appended rows without
-- limit — permanent corpus poisoning.
--
-- WHY NOT JUST WAIT FOR PHASE 7
-- Neither planned control actually closes this:
--   * Rate limiting (10 req/min per IP) bounds the RATE, not the total — and all
--     legitimate email-lane traffic arrives from Mailgun's own IP pool, so a
--     per-IP limit throttles genuine mail while an attacker keeps their own bucket.
--   * The Upstash token cache is a Redis cache: whatever TTL it uses is the window
--     after which a replay succeeds again, and the free tier evicts under memory
--     pressure. Finite retention gives finite protection.
-- A unique index has unlimited retention, no TTL, no eviction and no running cost.
--
-- HOW IT WORKS
-- Mailgun's `token` is single-use per delivery, so a replayed payload carries a
-- token we have already stored. The insert then raises 23505 — which persistPost
-- ALREADY swallows as a benign discard (the same path that handles a duplicate
-- instagram_post_id). No new error handling is needed; the replay simply no-ops.

-- ---------------------------------------------------------------------------
-- 1. Redact signatures already persisted
-- ---------------------------------------------------------------------------
-- The index below stops NEW replays; this removes the ability to replay what is
-- already stored. Without it, existing rows stay exploitable against any future
-- system that does not share this index.
--
-- Only `signature` is removed. Replay needs all three of timestamp/token/
-- signature, and the signature is HMAC-SHA256(timestamp + token) under the
-- signing key — so timestamp and token are inert without it. `token` MUST be
-- retained or the unique index below has nothing to key on.
update posts
   set raw_json = raw_json - 'signature'
 where source = 'email'
   and raw_json ? 'signature';

-- ---------------------------------------------------------------------------
-- 2. Reject replayed tokens
-- ---------------------------------------------------------------------------
-- Partial index: only the email lane carries a Mailgun token. Webhook/manual rows
-- have no `token` key, and indexing them would waste space to no purpose.
--
-- NOTE: this can fail if duplicate email tokens already exist. That would itself
-- be evidence of a past replay, so investigate rather than dropping the index —
-- `select raw_json->>'token', count(*) from posts where source='email'
--  group by 1 having count(*) > 1;`
create unique index posts_email_token_unique
  on posts ((raw_json ->> 'token'))
  where source = 'email';
