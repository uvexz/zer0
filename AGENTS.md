Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

# Project-Specific Guidelines

## Current Shape

Zer0 is a small multi-user fediverse microblog. User posts are called `zosts`; federation represents them mainly as ActivityPub `Note` objects wrapped in `Create` activities.

The implemented app is a Next.js 16.2 App Router project with React 19, TypeScript, Bun, Drizzle/Postgres, Better Auth, BullMQ/Redis, Fedify, Tailwind CSS v4, Kumo UI wrappers, and a few Base UI dependencies. Treat this as a real working codebase, not a greenfield prototype.

## This Is Not The Next.js You Know

Next.js is pinned to `16.2.4`. APIs, conventions, docs, caching behavior, and route handler details may differ from your training data. Before writing or changing Next-specific code, read the relevant local guide in `node_modules/next/dist/docs/`. Follow deprecation notices from that installed version.

## Runtime And Commands

- Use Bun scripts from `package.json`: `bun run dev`, `bun run worker`, `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`, `bun run db:generate`, `bun run db:migrate`, and `bun run seed`.
- Local dependencies are Postgres and Redis from `docker-compose.yml`.
- Runtime configuration is validated in `src/lib/env.ts`; update `.env.example` when adding required environment variables.
- The health check is `GET /api/health` and should report Postgres and Redis status.

## Implemented Product Surface

Keep docs and code aligned with what exists today:

- Email/password auth through Better Auth.
- First registration bootstraps the admin account; later registration requires invites.
- Local profiles with display name, bio, avatar, and header image.
- Zost creation with public, unlisted, followers-only, and direct visibility.
- Replies, likes, announces, bookmarks, hashtags, local mentions, notifications, and home timeline fanout.
- Image upload for zosts and profile media, with local or S3-compatible storage adapters, protected media routes, and Sharp-based variants.
- Public local profile and thread pages, plus logged-in Home, Search, Notifications, Settings, and Admin pages.
- ActivityPub endpoints for WebFinger, NodeInfo, actors, objects, activities, inboxes, outboxes, followers, following, and liked collections.
- Federation flows for Follow/Accept/Reject/Undo, Create Note, Delete, Like, Announce, Update Person, delivery jobs, remote lookup, and domain blocks.
- Worker processors for federation fanout, delivery, remote fetch, media processing, and timeline fanout. Some queue names are placeholders; do not claim every queue has complete behavior.

## Architecture Boundaries

- `src/app` contains App Router pages and route handlers.
- `src/features/*` owns product behavior. Prefer server actions and service functions there instead of burying business rules in React components.
- `src/db/schema.ts` is the source of truth for data shape. Drizzle migration files and snapshots should be generated by Drizzle unless there is a very specific reason to hand-edit them.
- `src/queue` defines typed BullMQ queue payloads. `src/worker/index.ts` owns long-running processors.
- `src/features/federation/fedify.ts`, `incoming.ts`, `outgoing.ts`, `vocab.ts`, and policy files own ActivityPub/Fedify behavior.
- `src/features/media/service.ts` and `storage.ts` own media validation, storage movement, variants, and public/protected URL decisions.

## Coding Rules For This Repo

- Use `requireUser()` and `requireAdmin()` for protected pages/actions.
- Use `ensureLocalActor()` before writing actor-scoped local social/federation state.
- After server actions mutate user-visible data, revalidate only the affected paths.
- Preserve visibility semantics. Public and unlisted media may become public storage keys; followers-only and direct media must stay behind protected serving rules.
- For ActivityPub data, prefer Fedify vocabulary classes and existing helpers over hand-built JSON. Keep audience and recipient decisions in the policy helpers and extend tests when those rules change.
- For UI, match the existing quiet tool-style app shell. Reuse `src/components/kumo.tsx`, `AppShell`, `ComposeBox`, `ZostCard`, and shared primitives before adding new component patterns.
- Do not market unfinished features in README or UI copy. If a queue, page, or federation path is skeletal, say so plainly.

## Verification

Pick checks based on risk:

- Pure docs: inspect the rendered Markdown shape and run no code unless needed.
- Business logic or policy changes: add/update focused Vitest coverage and run `bun run test`.
- Type-sensitive changes: run `bun run typecheck`.
- Next.js/page changes: run `bun run lint` and, when practical, `bun run build`.
- Federation, media, or worker changes: prefer targeted tests plus at least `bun run typecheck`; run the worker locally when validating queue behavior.
