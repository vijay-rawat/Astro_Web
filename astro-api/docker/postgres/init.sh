#!/bin/sh
# Runs once, when the Postgres volume is first created: the three Astro roles and the database.
set -e
psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -v owner_pw=owner-dev -v app_pw=app-dev -v auth_pw=auth-dev -v db=astro \
  -f /sql/db_roles.sql
