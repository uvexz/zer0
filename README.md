# Zer0

Zer0 is a small multi-user fediverse microblog built with Next.js. User posts are called `zosts`; in ActivityPub they are represented mainly as `Note` objects.

Current functionality includes email/password accounts, invite-based registration after the first admin user, local profiles, posting with visibility controls, replies, likes, announces, bookmarks, image uploads, notifications, basic admin tools, and ActivityPub federation support.

## Deployment

Zer0 runs as two processes:

- the Next.js web app
- a worker process for queues, federation delivery, media processing, and timeline fanout

It requires Postgres and Redis.

### Production With Docker Compose

Build or pull the Docker image, run migrations, and start the web and worker processes:

```bash
APP_ORIGIN=https://your-domain.example \
AUTH_SECRET=change-this-to-a-long-random-secret \
docker compose up -d --build
```

By default, the production compose file starts Postgres, Redis, the Next.js web app, a one-shot migration service, and the worker process. The web app listens on port `3000`; set `ZER0_PORT` to publish a different host port.

The compose file uses its bundled Postgres and Redis services by default. To use managed services instead, set:

```bash
ZER0_DATABASE_URL=postgres://user:password@host:5432/zer0
ZER0_REDIS_URL=redis://host:6379
```

To use an image built by GitHub Actions instead of building locally, set `ZER0_IMAGE`:

```bash
ZER0_IMAGE=ghcr.io/uvexz/zer0:latest docker compose up -d
```

The Docker workflow publishes `linux/amd64` and `linux/arm64` images to `ghcr.io/<owner>/<repo>` on pushes to `main` and version tags.

For production media storage, prefer S3-compatible storage:

```bash
MEDIA_STORAGE_DRIVER=s3
MEDIA_S3_BUCKET=...
MEDIA_S3_REGION=...
MEDIA_S3_ENDPOINT=...
MEDIA_S3_ACCESS_KEY_ID=...
MEDIA_S3_SECRET_ACCESS_KEY=...
MEDIA_S3_PUBLIC_BASE_URL=...
```

If `MEDIA_STORAGE_DRIVER=local`, the compose file stores media in the `media_data` Docker volume shared by the web and worker containers.

### Manual Or PaaS Deployment

Use the same image or repository as two separate long-running services:

```text
web: bun run start
worker: bun run worker
```

Run migrations once per deploy:

```bash
bun run db:migrate
```

### 1. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Set at least:

```bash
APP_ORIGIN=https://your-domain.example
AUTH_SECRET=change-this-to-a-long-random-secret
DATABASE_URL=postgres://user:password@host:5432/zer0
REDIS_URL=redis://host:6379
```

For a small managed Postgres plan, set `DATABASE_MAX_CONNECTIONS=4` or lower. This limit is per process, so the web app and worker each get their own pool.

For local file storage:

```bash
MEDIA_STORAGE_DRIVER=local
MEDIA_LOCAL_DIR=.localdata/media
```

For S3-compatible storage, set `MEDIA_STORAGE_DRIVER=s3` and fill the `MEDIA_S3_*` variables in `.env.example`.

### 2. Install And Prepare

```bash
bun install
bun run db:migrate
bun run seed
```

The seed command creates the invite code `ZER0-LOCAL` unless `SEED_INVITE_CODE` is set.

### 3. Start Services Locally

For local testing, Postgres and Redis can be started with:

```bash
docker compose -f docker-compose.dev.yml up -d postgres redis
```

Then run the web app and worker as local processes:

```bash
bun run dev
bun run worker
```

To test a production build locally without Docker:

```bash
bun run build
bun run start
```

### 4. Bootstrap Admin

Open the configured `APP_ORIGIN` in a browser. The first registered account does not need an invite and becomes the admin account. Later accounts require an invite code.

### 5. Health Check

```bash
curl https://your-domain.example/api/health
```

A healthy deployment returns:

```json
{"postgres":true,"redis":true}
```
