# ─────────────────────────────────────────────────────────────────────
# Dockerfile de VoiceOps — multietapa standalone (§16.1)
# ─────────────────────────────────────────────────────────────────────
# Imagen final pequeña basada en node:24-alpine. El servidor Next escucha
# 0.0.0.0 (HOSTNAME) — sin eso Traefik no lo alcanza y el contenedor parece
# sano pero inalcanzable (tabla de diagnóstico del README).
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.0.4 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.0.4 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Evita que lib/env falle si next build evalúa módulos que leen env(); no hay secretos reales aquí.
ENV POSTGRES_USER=c POSTGRES_PASSWORD=c POSTGRES_DB=c \
    APP_DB_USER=app_user APP_DB_PASSWORD=c \
    APP_URL=https://build.local APP_DOMAIN="" \
    DEFAULT_TIMEZONE=Europe/Madrid DEFAULT_COUNTRY_CODE=ES
RUN pnpm build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Usuario no root.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# salida standalone: incluye server.js y node_modules necesarios.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Migraciones en tiempo de arranque (entrypoint) y runner de migraciones CJS.
COPY --chown=nextjs:nodejs db ./db
COPY --chown=nextjs:nodejs scripts/migrate.cjs ./scripts/migrate.cjs
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]