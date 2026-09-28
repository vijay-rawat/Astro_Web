PgBouncer runs in transaction mode: a server connection is lent to a client only for the length of a
transaction, so thousands of app connections share a few dozen Postgres connections. Astro's tenant
setting uses `set_config(..., true)`, which lasts exactly one transaction, so it is safe here.

`userlist.txt` holds local development passwords only. In production use your platform's pooler
(Neon's pooled URL, RDS Proxy, Cloud SQL's managed PgBouncer) or mount a secret.
