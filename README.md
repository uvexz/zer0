# Zer0

Zer0 is a small multi-user fediverse microblog. User posts are called `zosts`; federation maps a local zost to an ActivityPub `Note`.

## Local Development

1. Copy environment defaults. The checked-in defaults point to the local Docker services:

```bash
cp .env.example .env
```

2. Start Postgres and Redis:

```bash
docker compose up -d postgres redis
```

3. Install dependencies and prepare the database:

```bash
bun install
bun run db:migrate
bun run seed
```

4. Start the app and worker in separate terminals:

```bash
bun run dev
bun run worker
```

Open [http://localhost:3000](http://localhost:3000). The first registered account does not need an invite and becomes the instance admin. The seed command creates the invite code `ZER0-LOCAL` for later accounts.

5. Confirm the local runtime baseline:

```bash
curl http://localhost:3000/api/health
```

It should return `{"postgres":true,"redis":true}` with HTTP 200.

## Federation Smoke Testing

Localhost actors can be inspected locally, but real Mastodon/Misskey interoperability needs a stable public HTTPS `APP_ORIGIN`. For a temporary tunnel, set `APP_ORIGIN` to the tunnel origin before registering test users or creating local actors, then rerun migrations against a clean test database.

Recommended smoke path:

```bash
bun run db:migrate
bun run seed
bun run dev
bun run worker
```

Then verify:

- WebFinger resolves `acct:<username>@<host>` to `/users/<username>`.
- Remote Mastodon/Misskey can find and follow the local actor.
- Zer0 accepts the remote Follow and creates an outgoing Accept delivery.
- A public zost creates fanout and delivery jobs visible in `/admin/federation`.
- Remote reply, like, and boost create inbox events and local interaction rows.

## Useful Commands

```bash
bun run lint
bun run typecheck
bun run test
bun run build
bun run db:generate
bun run db:migrate
```

## Current Scope

Implemented foundation includes Better Auth email/password login, bootstrap admin registration, invite-gated later registration, local profiles, zost creation, local timeline, replies, likes, announces, bookmarks, image upload, protected media routes, basic admin pages, queue/worker skeletons, WebFinger, NodeInfo, actor, object, inbox, and outbox endpoints.
