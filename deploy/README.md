# Deploying crypz

```
app.example.com  → Vercel (packages/web)       VITE_API_URL=https://api.example.com
api.example.com  → VPS: Caddy → api container (packages/api, Bun + Hono) → Postgres container
```

The web app holds no secrets. Exchange keys, the credentials master key and the auth secret live only on the VPS.

## 1. Database (once)

Find your Postgres container and the Docker network it is on:

```sh
docker ps --format '{{.Names}}' | grep -i postgres
docker inspect <postgres-container> -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

Set `networks.postgres.name` in `docker-compose.yml` to that network, then create a dedicated role and database
(never let the app use the `postgres` superuser):

```sh
docker exec -it <postgres-container> psql -U postgres \
  -c "CREATE ROLE crypz LOGIN PASSWORD '<long random password>';" \
  -c "CREATE DATABASE crypz OWNER crypz;"
```

Keep port 5432 closed to the internet; the api reaches Postgres over the Docker network.

## 2. Secrets (once)

```sh
cd deploy
cp .env.api.example .env.api && chmod 600 .env.api
openssl rand -base64 32   # → CREDENTIALS_KEY
openssl rand -base64 32   # → BETTER_AUTH_SECRET
```

Fill in `DATABASE_URL` (host = the Postgres container name), the domains and `COOKIE_DOMAIN`.

**Back up `CREDENTIALS_KEY` somewhere offline.** Without it the stored exchange keys cannot be decrypted, and every
user has to re-enter theirs.

## 3. Run

```sh
cd deploy
docker compose up -d --build     # runs migrations first, then starts the api
docker compose logs -f api
curl -s https://api.example.com/health
```

Updating: `git pull && docker compose up -d --build`. New migrations apply automatically.

## 4. Caddy

Append `Caddyfile.example` (with your domain) to the Caddyfile and `caddy reload`. Caddy fetches the TLS certificate.

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
