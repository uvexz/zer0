# Zer0

Zer0 is a small multi-user fediverse microblog built with Next.js. User posts are called `zosts`; in ActivityPub they are represented mainly as `Note` objects.

Current functionality includes email/password accounts, invite-based registration after the first admin user, local profiles, posting with visibility controls, replies, likes, announces, bookmarks, image uploads, notifications, basic admin tools, and ActivityPub federation support.

## Deployment

Zer0 runs as two processes:

- the Next.js web app
- a worker process for queues, federation delivery, media processing, and timeline fanout

It requires Postgres and Redis.

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

### 3. Start Services

For production:

```bash
bun run build
bun run start
```

Start the worker as a separate long-running process:

```bash
bun run worker
```

For local testing, Postgres and Redis can be started with:

```bash
docker compose up -d postgres redis
```

Then run:

```bash
bun run dev
bun run worker
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
