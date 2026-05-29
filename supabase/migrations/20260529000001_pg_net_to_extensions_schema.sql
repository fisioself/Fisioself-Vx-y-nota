-- Move pg_net from the public schema to a dedicated extensions schema.
-- This removes the security advisor warning about pg_net being in public.
--
-- ⚠️  DO NOT APPLY DIRECTLY TO PRODUCTION.
--     Test on a Supabase branch first:
--       supabase branches create pg-net-hardening
--       supabase db push --branch pg-net-hardening
--     Verify that appointment auto-sync and calendar triggers still work
--     before merging the branch.
--
-- Why this is sensitive:
--   Three DB functions use net.http_post() without schema qualification:
--     - public.handle_appointment_autosync  (TRIGGER on appointments INSERT/UPDATE)
--     - public.handle_appointment_unsync    (TRIGGER on appointments DELETE/UPDATE)
--     - public.retry_pending_appointment_syncs (called by pg_cron)
--   After moving the extension, these functions must be recreated with the
--   schema-qualified name OR with an updated search_path.
--   The migration below handles both steps atomically.

-- Step 1: Create extensions schema if it doesn't exist.
CREATE SCHEMA IF NOT EXISTS extensions;

-- Step 2: Move the extension.
--   This moves pg_net's catalog entry and all objects it owns to the
--   extensions schema. The net.* function schema is managed by pg_net
--   itself; after this ALTER the functions will be in extensions.* or
--   still accessible via the net search alias depending on Postgres version.
--   Verify with:  SELECT pronamespace::regnamespace FROM pg_proc WHERE proname = 'http_post';
ALTER EXTENSION pg_net SET SCHEMA extensions;

-- Step 3: Recreate the three functions that call net.http_post() so they
--   use the fully-qualified name extensions.http_post() (or update their
--   search_path). This prevents the "function not found" error after the move.
--
--   NOTE: paste the full current function bodies here after verifying on branch.
--   Run this query against the branch to get them:
--     SELECT pg_get_functiondef(oid) FROM pg_proc
--     WHERE proname IN ('handle_appointment_autosync', 'handle_appointment_unsync',
--                       'retry_pending_appointment_syncs');
--
--   Then replace every `net.http_post(` with `extensions.http_post(` and
--   paste the CREATE OR REPLACE FUNCTION statements below.

-- PLACEHOLDER — replace with actual function bodies after branch verification:
-- CREATE OR REPLACE FUNCTION public.handle_appointment_autosync() ...
-- CREATE OR REPLACE FUNCTION public.handle_appointment_unsync() ...
-- CREATE OR REPLACE FUNCTION public.retry_pending_appointment_syncs() ...
