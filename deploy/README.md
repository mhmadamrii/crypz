# Deploying crypz

```
app.example.com  → Vercel (packages/web)       VITE_API_URL=https://api.example.com
api.example.com  → VPS: Caddy → api container (packages/api, Bun + Hono) → Postgres container
```

The web app holds no secrets. Exchange keys, the credentials master key and the auth secret live only on the VPS.

This assumes the VPS already runs **Caddy and Postgres in Docker** (Caddy proxying to container names such as
`server:8080`). crypz adds one container, `crypz_api`, that joins Caddy's network and Postgres's network. It publishes
no host port, so it cannot collide with anything else on the machine; Caddy reaches it as `crypz_api:3001`.

## 0. Find your networks (once)

```sh
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'

# networks Caddy is on (pick the one its own compose file defines, so it survives a Caddy restart)
docker inspect <caddy-container> -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'

# network the Postgres you want to use is on
docker inspect <postgres-container> -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

```sh
cd crypz/deploy
cp .env.example .env          # set CADDY_NETWORK and POSTGRES_NETWORK to the names above
```

## 1. Database (once)

Use an existing Postgres container and give crypz its own role and database (never the `postgres` superuser):

```sh
docker exec -it <postgres-container> psql -U postgres \
  -c "CREATE ROLE crypz LOGIN PASSWORD '<long random password>';" \
  -c "CREATE DATABASE crypz OWNER crypz;"
```

Keep port 5432 closed to the internet; the api reaches Postgres over the Docker network.

## 2. Secrets (once)

```sh
cp .env.api.example .env.api && chmod 600 .env.api
openssl rand -base64 32   # → CREDENTIALS_KEY
openssl rand -base64 32   # → BETTER_AUTH_SECRET
```

Fill in `DATABASE_URL` (host = the Postgres container name, e.g. `postgresql://crypz:…@<postgres-container>:5432/crypz`),
the two domains and `COOKIE_DOMAIN`. Both `.env` files are git-ignored.

**Back up `CREDENTIALS_KEY` somewhere offline.** Without it the stored exchange keys cannot be decrypted, and every
user has to re-enter theirs.

## 3. Run

```sh
docker compose up -d --build     # runs migrations first, then starts crypz_api
docker compose logs -f api
docker exec crypz_api bun -e "fetch('http://localhost:3001/health').then(r => r.text()).then(console.log)"
```

Updating: `git pull && docker compose up -d --build`. New migrations apply automatically.

## 4. DNS and Caddy

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
   docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile
   curl -s https://api.<your-domain>/health    # {"ok":true}
   ```

Caddy fetches the TLS certificate on the first request. A `502` from `/health` means Caddy cannot reach
`crypz_api`: it is not on the same network as Caddy, so recheck `CADDY_NETWORK` (or the api is not running).

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
docker exec <postgres-container> pg_dump -U crypz -Fc crypz > crypz-$(date +%F).dump
```

## Rotating the credentials key

1. Add the new key as `CREDENTIALS_KEY_V2` and set `CREDENTIALS_KEY_VERSION=2`. New keys are sealed with v2; old
   rows still open with v1 (`CREDENTIALS_KEY`).
2. Re-seal old rows (not automated yet), then remove `CREDENTIALS_KEY`.
