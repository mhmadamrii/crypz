podman-compose run --rm migrate

# expect: "1 migration found … All migrations have been successfully applied."

podman-compose up -d api
podman logs crypz_api

# expect: "[api] listening on :3001"

Use up -d api, not plain up -d. Plain up -d also starts the migrate service in the background, so you can't easily see whether the migration succeeded.

Then check that the API answers before touching Caddy:
podman exec crypz_api bun -e "fetch('http://localhost:3001/health').then(r=>r.text()).then(console.log)"

# {"ok":true}

If migrate fails, it's usually the database: the crypz user/database doesn't exist, the password in DATABASE_URL is wrong, or NETWORK is wrong (so kommers_postgres_1 can't be found). Paste me the error if so.

007 Reporting for duty!
