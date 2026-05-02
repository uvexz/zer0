import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { actors, profiles } from "@/db/schema";
import { auth } from "@/features/auth/auth";
import { consumeInvite, isFirstLocalUser, validateInvite } from "@/features/auth/invites";
import { createId } from "@/lib/id";
import { env } from "@/lib/env";
import { checkRateLimit, clientAddress, rateLimitHeaders } from "@/lib/rate-limit";

const handlers = toNextJsHandler(auth);

export const dynamic = "force-dynamic";

async function guardedPost(request: Request) {
  const url = new URL(request.url);
  const isSignUp = url.pathname.endsWith("/api/auth/sign-up/email");
  const isSignIn =
    url.pathname.endsWith("/api/auth/sign-in/email") ||
    url.pathname.endsWith("/api/auth/passkey/verify-authentication");

  if (isSignIn || isSignUp) {
    const rateLimit = checkRateLimit(`auth:${isSignUp ? "signup" : "signin"}:${clientAddress(request)}`, {
      limit: isSignUp ? 10 : 30,
      windowMs: 15 * 60_000,
    });
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Too many authentication attempts. Try again later." },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      );
    }
  }

  if (!isSignUp) {
    return handlers.POST(request);
  }

  const clonedRequest = request.clone();
  const body = (await clonedRequest.json().catch(() => null)) as {
    email?: string;
    name?: string;
    username?: string;
    inviteCode?: string;
  } | null;

  const isBootstrapRegistration = await isFirstLocalUser();
  const invite = !isBootstrapRegistration && body?.inviteCode
    ? await validateInvite(body.inviteCode)
    : null;

  if (!isBootstrapRegistration && !invite) {
    return NextResponse.json({ error: "A valid invite code is required." }, { status: 403 });
  }

  const requestedUsername = normalizeUsername(
    body?.username || body?.name || body?.email?.split("@")[0] || "",
  );
  const [existingProfile] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.username, requestedUsername))
    .limit(1);

  if (existingProfile) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }

  const response = await handlers.POST(request);
  if (!response.ok) return response;

  const payload = (await response.clone().json().catch(() => null)) as {
    user?: { id: string; name: string; email: string };
  } | null;
  const user = payload?.user;

  if (user) {
    const username = requestedUsername;
    const actorId = createId("actor");
    const actorUri = `${env.APP_ORIGIN}/users/${username}`;

    await db.transaction(async (tx) => {
      const existingProfiles = await tx
        .select({ userId: profiles.userId })
        .from(profiles)
        .limit(1);
      const isAdmin = existingProfiles.length === 0;

      await tx
        .insert(profiles)
        .values({
          userId: user.id,
          username,
          displayName: user.name || username,
          isAdmin,
        })
        .onConflictDoNothing();

      await tx
        .insert(actors)
        .values({
          id: actorId,
          type: "local",
          userId: user.id,
          handle: username,
          domain: new URL(env.APP_ORIGIN).host,
          uri: actorUri,
          inboxUrl: `${actorUri}/inbox`,
          outboxUrl: `${actorUri}/outbox`,
          followersUrl: `${actorUri}/followers`,
          followingUrl: `${actorUri}/following`,
          preferredUsername: username,
          name: user.name || username,
        })
        .onConflictDoNothing();

      if (invite) {
        await consumeInvite(invite.id);
      }
    });
  }

  return response;
}

function normalizeUsername(value: string) {
  const username = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

  return username.length >= 2 ? username : `user_${crypto.randomUUID().slice(0, 8)}`;
}

export const GET = handlers.GET;
export const POST = guardedPost;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
