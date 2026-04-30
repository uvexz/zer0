# syntax=docker/dockerfile:1.7

FROM oven/bun:1-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1-slim AS runner

WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000

RUN mkdir -p /data/media \
  && chown -R bun:bun /app /data

COPY --from=builder --chown=bun:bun /app ./

USER bun

EXPOSE 3000

CMD ["bun", "run", "start"]
