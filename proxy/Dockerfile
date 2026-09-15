# syntax=docker/dockerfile:1
#
# Wolfi-based Nginx — same Chainguard rationale as backend/ and database/:
# a distroless-family runtime (no shell, no package manager, rebuilt often for
# CVE patches). Only the floating ":latest" tag is free, so we build FROM it
# and tag *that* ourselves for a version we control instead of one that can
# change under a running deployment on every pull. Alpine's
# `nginx:<version>-alpine` is the documented fallback if this base ever
# becomes unworkable.
#
# This single image fills the "frontend static host + reverse proxy" slot from
# docs/design/uac-design.md §6/§7. It has two build targets:
#
#   --target dev     `/` is reverse-proxied to the Expo web dev server (the
#                    `frontend` container running `expo start`), so hot reload
#                    and the Metro websocket keep working. Nothing is served
#                    from disk. Used by docker-compose.dev.yml.
#
#   --target static  the Expo web export is built here and baked into the
#                    image, then served straight from disk. Used by
#                    staging/prod. This is the default target.
#
# In BOTH targets every backend route is reverse-proxied to the `backend`
# service — never served or cached here ("backend should always be a reverse
# proxy").
#
# The build context is the repo root (not proxy/), so the `web-build` stage
# below can reach frontend/. See the root .dockerignore.

# ---- web build (static target only) ---------------------------------------
# Chainguard's node "-dev" variant has npm and a shell, unlike the runtime
# image. This stage is never pulled into the `dev` target's graph, so a dev
# build never pays for it.
FROM cgr.dev/chainguard/node:latest-dev AS web-build

# npm ci writes into node_modules; the image's default `node` user can't.
USER root
WORKDIR /app

ENV CI=1 \
    EXPO_NO_TELEMETRY=1

# Public base URL the web app resolves API calls against. Expo inlines
# EXPO_PUBLIC_* into the bundle at build time, so this must be set now, not at
# container start. Point it at the origin this proxy is served on (same-origin
# `/auth`, `/orders`, … then flow through the reverse-proxy rules below).
ARG EXPO_PUBLIC_API_URL
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}

# package.json + lockfile first so the dependency layer caches independently
# of app-source churn.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# app.json sets web.output=static, so this writes a self-contained static site
# (one HTML file per route, hashed JS/CSS under _expo/, assets under assets/)
# to dist/.
RUN npx expo export --platform web --output-dir dist

# ---- backend-proxy config templating --------------------------------------
# Bakes BACKEND_UPSTREAM_HOST into proxy_backend.conf at build time — see the
# template's own comment for why this can't happen at container start.
# Reuses the node "-dev" base (same shell-availability rationale as
# web-build above) purely to run `sed`.
FROM cgr.dev/chainguard/node:latest-dev AS proxy-conf
ARG BACKEND_UPSTREAM_HOST=backend
WORKDIR /conf
COPY proxy/snippets/proxy_backend.conf.template ./proxy_backend.conf
RUN sed -i "s/__BACKEND_UPSTREAM_HOST__/${BACKEND_UPSTREAM_HOST}/" proxy_backend.conf

# ---- shared nginx base ---------------------------------------------------
FROM cgr.dev/chainguard/nginx:latest AS base

# The stock image's `http {}` (in nginx.conf) is fine as-is — it only does
# `include /etc/nginx/conf.d/*.conf`. The demo server block it ships lives at
# conf.d/nginx.default.conf; each target below *overwrites that exact file*
# with our own server block, so there is only ever one server on :8080 (a
# second file would just add a competing `server_name`, and Host-based
# matching could pick either). The runtime image has no shell, so it can't be
# `rm`ed — it has to be clobbered by path.
#
# The shared proxy directives are pulled in with an explicit `include`, so
# they must NOT sit in conf.d/ (glob-loaded as *.conf) — they live in
# snippets/. proxy_backend.conf comes from the templating stage above rather
# than straight off disk (see that stage's comment); everything else in
# snippets/ is copied as-is.
COPY proxy/snippets/backend_routes.conf /etc/nginx/snippets/backend_routes.conf
COPY --from=proxy-conf /conf/proxy_backend.conf /etc/nginx/snippets/proxy_backend.conf

EXPOSE 8080

# ---- dev ---------------------------------------------------------------
FROM base AS dev
COPY proxy/conf.d/dev.conf /etc/nginx/conf.d/nginx.default.conf

# ---- static (default) ------------------------------------------------
FROM base AS static
COPY proxy/conf.d/static.conf /etc/nginx/conf.d/nginx.default.conf
COPY --from=web-build /app/dist /usr/share/nginx/html
