# proxy

Wolfi-based ([Chainguard](https://images.chainguard.dev/directory/image/nginx/overview))
Nginx image that is both the **frontend host** and the **reverse proxy** in front of the
backend — the `frontend` + reverse-proxy slot from
[`docs/design/uac-design.md`](../docs/design/uac-design.md) §6/§7.

## What it does

| Path | dev target | static target (staging/prod) |
| --- | --- | --- |
| `/auth/`, `/users/`, `/orders/`, `/health`, `/docs`, `/redoc`, `/openapi.json` | reverse-proxy → `backend:8000` | reverse-proxy → `backend:8000` |
| everything else (`/`, `/login`, `/_expo/…`, `/assets/…`) | reverse-proxy → `frontend:8081` (Expo dev server, hot reload) | served from the Expo web export baked into the image |
| `/healthz` | `200 ok` (this proxy's own liveness) | `200 ok` |

The backend is **always** reverse-proxied — never served or cached here.

## Build targets

`proxy/Dockerfile` (build context is the **repo root**):

- **`dev`** — config only, no static files. `docker-compose.dev.yml` uses it alongside a
  `frontend` container running `expo start`.
- **`static`** (default) — a `web-build` stage runs `npx expo export --platform web` and the
  result is baked in at `/usr/share/nginx/html`. Staging/prod use it.

### `EXPO_PUBLIC_API_URL`

The web app resolves API calls against `EXPO_PUBLIC_API_URL`, and Expo inlines it into the
bundle **at build time**. For the `static` target, pass it as a build arg — the staging/prod
compose overlays require it:

```bash
EXPO_PUBLIC_API_URL=https://pantrycast.example.com \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml build proxy
```

Set it to the public origin this proxy is reached at, so `/auth`, `/orders`, … stay
same-origin and flow through the reverse-proxy rules above.

## Config layout

- `conf.d/dev.conf`, `conf.d/static.conf` — the per-target `server {}` block (one is copied
  to `/etc/nginx/conf.d/nginx.default.conf`, replacing the image's demo block — see Notes).
- `snippets/backend_routes.conf` — the list of `location`s proxied to the backend, `include`d
  by both configs so they can't drift. **Add new backend route groups here.**
- `snippets/proxy_backend.conf` — the shared `proxy_pass` / header directives.

## Notes

- The Chainguard nginx runtime is distroless — no shell, curl, or wget — so there is no
  compose `HEALTHCHECK`; probe `/healthz` from outside (load balancer / uptime monitor).
- Listens on `8080` (Chainguard nginx default; non-privileged).
- `backend`/`frontend` are resolved per-request via Docker's embedded DNS (`resolver
  127.0.0.11`), so the proxy starts (and `nginx -t` passes) even when they're down.
- The image overwrites the stock server block at `conf.d/nginx.default.conf` (not
  `default.conf`) — a second file would just add a competing `server_name` on `:8080`.
- Dev hot reload relies on Metro watching the bind-mounted `frontend/` source; on
  Docker Desktop for Windows/macOS that can need polling if edits aren't picked up.
- No Docker-build gate in CI yet — a `docker build` + `nginx -t` job is a follow-up.
