-- Database roles for Astro. Run once per database server as an admin (superuser or, on Neon,
-- the project owner), before the first migration:
--
--   psql "$ADMIN_URL" -v owner_pw=... -v app_pw=... -v auth_pw=... -v db=astro -f scripts/db_roles.sql
--
-- astro_owner  owns the tables and runs migrations. Never used by the running app.
-- astro_app    the API's role. Row-level security limits it to one company per transaction.
-- astro_auth   sign-in lookups only (user by email, session by cookie). Its policies cover the
--              auth tables and nothing else; it has no grants on company data added later.
-- None of them is a superuser or has BYPASSRLS, so row-level security always applies.

SELECT format('CREATE ROLE astro_owner LOGIN PASSWORD %L', :'owner_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'astro_owner') \gexec
SELECT format('CREATE ROLE astro_app LOGIN PASSWORD %L', :'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'astro_app') \gexec
SELECT format('CREATE ROLE astro_auth LOGIN PASSWORD %L', :'auth_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'astro_auth') \gexec

ALTER ROLE astro_owner NOSUPERUSER NOBYPASSRLS;
ALTER ROLE astro_app NOSUPERUSER NOBYPASSRLS;
ALTER ROLE astro_auth NOSUPERUSER NOBYPASSRLS;

-- Bound every query the app runs, so one slow query can't hold a connection for long.
ALTER ROLE astro_app SET statement_timeout = '5s';
ALTER ROLE astro_auth SET statement_timeout = '5s';
ALTER ROLE astro_app SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE astro_auth SET idle_in_transaction_session_timeout = '15s';

SELECT format('CREATE DATABASE %I OWNER astro_owner', :'db')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec

\connect :db
ALTER SCHEMA public OWNER TO astro_owner;
GRANT USAGE ON SCHEMA public TO astro_app, astro_auth;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
