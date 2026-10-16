# Deploying crypz

```
app.example.com  → Vercel (packages/web)       VITE_API_URL=https://api.example.com
api.example.com  → VPS: Caddy → api container (packages/api, Bun + Hono) → Postgres container
```

The web app holds no secrets. Exchange keys, the credentials master key and the auth secret live only on the VPS.

This assumes the VPS already runs **Caddy and Postgres in containers on one shared network** (Caddy proxying to
container names such as `server:8080`). crypz adds one container, `crypz_api`, on that network. It publishes no host
port, so it cannot collide with anything else on the machine; Caddy reaches it as `crypz_api:3001`.

Commands below use `podman`; `docker` works the same.

## 0. Find your network (once)

```sh
podman inspect <caddy-container> <postgres-container> \
  --format '{{.Name}}: {{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

Pick the network both are on (for compose projects usually `<project>_default`).

```sh
cd crypz/deploy
cp .env.example .env          # NETWORK=<that network>
```

## 1. Database (once)

Give crypz its own role and database in the existing Postgres (never the admin user):

```sh
openssl rand -hex 24          # password for the crypz role (hex: no escaping needed in DATABASE_URL)
podman exec -it <postgres-container> sh -c 'psql -U "$POSTGRES_USER" -d postgres'
```

```sql
CREATE ROLE crypz LOGIN PASSWORD '<hex password>';
CREATE DATABASE crypz OWNER crypz;
```

## 2. Secrets (once)

```sh
cp .env.api.example .env.api && chmod 600 .env.api
openssl rand -base64 32   # → CREDENTIALS_KEY
openssl rand -base64 32   # → BETTER_AUTH_SECRET
```

Fill in `DATABASE_URL` (host = the Postgres container name, e.g.
`postgresql://crypz:<hex password>@<postgres-container>:5432/crypz?schema=public`), the two domains and
`COOKIE_DOMAIN`. Both `.env` files are git-ignored.

**Back up `CREDENTIALS_KEY` somewhere offline.** Without it the stored exchange keys cannot be decrypted, and every
user has to re-enter theirs.

## 3. Run (every deploy)

```sh
git pull
podman compose run --rm migrate      # apply migrations
podman compose up -d --build api     # build and (re)start crypz_api
podman logs -f crypz_api             # "[api] listening on :3001"
```

## 4. DNS and Caddy (once)

1. Point an `A` record for `api.<your-domain>` at the VPS IP (`curl -4 ifconfig.me`), and wait until it resolves.
2. Add a block to your existing Caddyfile:

   ```
   api.<your-domain> {
       encode gzip
       reverse_proxy crypz_api:3001
   }
   ```

3. Reload Caddy without downtime, then check from outside:

   ```sh
   podman exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile
   curl -s https://api.<your-domain>/health    # {"ok":true}
   ```

Caddy fetches the TLS certificate on the first request. A `502` from `/health` means Caddy cannot reach `crypz_api`:
it is not on Caddy's network (recheck `NETWORK`) or it is not running.

## 5. Vercel (web)

- Project domain: `app.example.com`
- Env: `VITE_API_URL=https://api.example.com`
- Remove the old `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_API_PASSPHRASE` variables; the web app no longer reads them.

## 6. Exchange keys

Users add keys under **Settings → Exchange keys**. The api asks OKX for the key's permissions and refuses anything
that is not read-only. Tell users to bind their key to the VPS's public IP (`curl -4 ifconfig.me` on the VPS): every
OKX call, market data included, leaves from that address.

## Backups

```sh
# e.g. daily via cron; keep copies off the VPS
podman exec <postgres-container> pg_dump -U crypz -Fc crypz > crypz-$(date +%F).dump
```

## Rotating the credentials key

1. Add the new key as `CREDENTIALS_KEY_V2` and set `CREDENTIALS_KEY_VERSION=2`. New keys are sealed with v2; old
   rows still open with v1 (`CREDENTIALS_KEY`).
2. Re-seal old rows (not automated yet), then remove `CREDENTIALS_KEY`.
