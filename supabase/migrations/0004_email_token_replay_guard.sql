-- 0004_email_token_replay_guard.sql
-- Make replayed Mailgun payloads collide on insert, and redact the signatures
-- already stored. Follow-up to issue #53 (PR #54 review).
--
-- WHY THIS EXISTS
-- #53 changed the email lane so a stale-but-validly-signed payload is STORED
-- (parsing_status 'skipped') rather than rejected with a 400. That fixed real data
-- loss, but it also removed the only thing that stopped a replayed payload from
-- writing a row. Since `posts` is the permanent ML corpus and is never purged, an
-- attacker holding one captured tuple could otherwise append rows without limit.
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
--
-- WHY THIS IS ONE DO BLOCK — DO NOT SPLIT IT INTO SEPARATE STATEMENTS.
-- It must be all-or-nothing, and a DO block is a single statement, so it is
-- atomic under every runner regardless of whether that runner wraps migrations in
-- a transaction or sets ON_ERROR_STOP.
--
-- This was verified the hard way. An earlier draft used three top-level
-- statements (UPDATE, then CREATE INDEX). Applied to a database containing
-- duplicate tokens it reported `UPDATE 2` — committed — and only then failed on
-- the index, leaving the signatures permanently stripped, no index, and the
-- migration unrecorded so every later migration was blocked. Reordering alone did
-- not fix it either: psql's autocommit continues past a failed statement, so the
-- irreversible UPDATE still ran after the guard had already raised.

-- ---------------------------------------------------------------------------
-- 1. Guard: refuse to run if duplicate email tokens already exist
-- ---------------------------------------------------------------------------
-- Duplicate tokens are NOT necessarily evidence of an attack. Before this
-- migration there was no dedup, so an ordinary Mailgun retry after a transient
-- 5xx re-sent the same tuple; if it landed inside the old 15-minute freshness
-- window it was accepted and stored a second time. Re-running scripts/
-- sign-mailgun.mjs with a fixed --token on a dev database does the same.
--
-- Resolution is a judgement call for a human, not something a migration should do
-- silently: `posts` is the permanent training corpus and must never be purged, so
-- this refuses rather than deleting anything. The suggested fix below re-keys the
-- later duplicates instead of removing them — no row is lost and no value is
-- discarded, the token simply stops participating in the uniqueness constraint.
do $$
declare
  dupes integer;
begin
  -- 1. Guard -----------------------------------------------------------------
  -- Must mirror the index key below exactly, or the guard and the index disagree.
  --
  -- `raw_json ? 'token'` is NOT the right null test: it is true for
  -- {"token": null}, whose ->> yields SQL NULL. GROUP BY collapses all NULLs into
  -- one group, so two such rows would trip this exception even though a unique
  -- index accepts unlimited NULL keys — a false positive that would roll back the
  -- whole migration. Test the extracted value instead.
  select count(*) into dupes
    from (
      select (raw_json ->> 'timestamp') || (raw_json ->> 'token') as signed_string
        from posts
       where source = 'email'
         and raw_json ->> 'timestamp' is not null
         and raw_json ->> 'token' is not null
       group by 1
      having count(*) > 1
    ) d;

  if dupes > 0 then
    raise exception
      'Cannot create posts_email_token_unique: % duplicate email token(s) exist.', dupes
      using hint =
        'Inspect with: select (raw_json->>''timestamp'')||(raw_json->>''token'') s, '
        'count(*) from posts where source=''email'' group by 1 having count(*) > 1; '
        'These are most likely legitimate pre-dedup Mailgun retries, not an attack: '
        'before this migration there was no dedup, so a retry after a transient 5xx '
        're-sent the same tuple and was stored again if still inside the freshness '
        'window. To resolve WITHOUT deleting corpus rows (posts is the permanent '
        'training corpus and must never be purged), keep the token on the earliest '
        'row per group and re-key the later ones — no row is lost and no value is '
        'discarded, the token simply stops participating in the constraint: '
        'update posts p set raw_json = (raw_json - ''token'') || '
        'jsonb_build_object(''token_superseded'', raw_json->>''token'') '
        'where source=''email'' and id <> (select id from posts q where q.source=''email'' '
        'and (q.raw_json->>''timestamp'')||(q.raw_json->>''token'') '
        '= (p.raw_json->>''timestamp'')||(p.raw_json->>''token'') '
        'order by q.created_at limit 1);';
  end if;

  -- 2. Reject replayed tokens ------------------------------------------------
  -- Partial index: only the email lane carries a Mailgun token. Webhook/manual
  -- rows have no `token` key, so indexing them would waste space to no purpose.
  --
  -- The key is `timestamp || token`, NOT `token` alone. Mailgun signs those two
  -- concatenated with no delimiter, so the boundary between them is ambiguous:
  -- the same signed string can be re-split at any interior index and every split
  -- verifies under the SAME signature while yielding a DIFFERENT token. Keying on
  -- token alone lets one captured tuple produce dozens of distinct keys and walk
  -- straight through this guard (verified: 41 working re-splits for a 10-digit
  -- timestamp and a 32-char token).
  --
  -- The concatenation is exactly the string Mailgun signed, so it is invariant
  -- under re-splitting — every variant collides here. The validator also pins the
  -- timestamp to 10 digits, which makes the split unique on the way in; this index
  -- is the structural backstop that holds even if that check is ever loosened.
  execute 'create unique index posts_email_token_unique '
          'on posts (((raw_json ->> ''timestamp'') || (raw_json ->> ''token''))) '
          'where source = ''email''';

  -- 3. Redact signatures already persisted -----------------------------------
  -- The index above stops NEW replays; this removes the ability to replay what is
  -- already stored. Without it, existing rows stay exploitable against any future
  -- system that does not share that index.
  --
  -- Only `signature` is removed. Replay needs all three of timestamp/token/
  -- signature, and the signature is HMAC-SHA256(timestamp + token) under the
  -- signing key — so timestamp and token are inert without it. `token` MUST be
  -- retained or the unique index above has nothing to key on.
  --
  -- Runs last precisely because it cannot be undone.
  update posts
     set raw_json = raw_json - 'signature'
   where source = 'email'
     and raw_json ? 'signature';
end $$;
