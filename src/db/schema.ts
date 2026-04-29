import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const visibilityEnum = pgEnum("visibility", [
  "public",
  "unlisted",
  "followers",
  "direct",
]);

export const followStateEnum = pgEnum("follow_state", [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
]);

export const actorTypeEnum = pgEnum("actor_type", ["local", "remote"]);
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "queued",
  "delivering",
  "delivered",
  "failed",
  "dead",
]);

export const activityDirectionEnum = pgEnum("activity_direction", [
  "incoming",
  "outgoing",
]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio").notNull().default(""),
    avatarUrl: text("avatar_url"),
    headerUrl: text("header_url"),
    isAdmin: boolean("is_admin").notNull().default(false),
    disabledAt: timestamp("disabled_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("profiles_username_idx").on(sql`lower(${table.username})`)],
);

export const invites = pgTable("invites", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  creatorUserId: text("creator_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  disabledAt: timestamp("disabled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const actors = pgTable(
  "actors",
  {
    id: text("id").primaryKey(),
    type: actorTypeEnum("type").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    domain: text("domain").notNull(),
    uri: text("uri").notNull().unique(),
    inboxUrl: text("inbox_url"),
    sharedInboxUrl: text("shared_inbox_url"),
    outboxUrl: text("outbox_url"),
    followersUrl: text("followers_url"),
    followingUrl: text("following_url"),
    preferredUsername: text("preferred_username").notNull(),
    name: text("name"),
    summary: text("summary"),
    avatarUrl: text("avatar_url"),
    headerUrl: text("header_url"),
    publicKeyPem: text("public_key_pem"),
    privateKeyPem: text("private_key_pem"),
    rawJson: jsonb("raw_json"),
    lastFetchedAt: timestamp("last_fetched_at"),
    blockedAt: timestamp("blocked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("actors_handle_domain_idx").on(table.handle, table.domain),
    index("actors_user_id_idx").on(table.userId),
  ],
);

export const actorKeys = pgTable(
  "actor_keys",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    keyId: text("key_id").notNull().unique(),
    algorithm: text("algorithm").notNull().default("RSASSA-PKCS1-v1_5"),
    publicJwk: jsonb("public_jwk").notNull(),
    privateJwk: jsonb("private_jwk").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("actor_keys_actor_id_idx").on(table.actorId)],
);

export const follows = pgTable(
  "follows",
  {
    followerActorId: text("follower_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    followeeActorId: text("followee_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    state: followStateEnum("state").notNull().default("pending"),
    activityUri: text("activity_uri"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerActorId, table.followeeActorId] }),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    uri: text("uri").notNull().unique(),
    url: text("url").notNull(),
    authorActorId: text("author_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    contentHtml: text("content_html").notNull(),
    contentText: text("content_text").notNull(),
    summary: text("summary"),
    visibility: visibilityEnum("visibility").notNull().default("public"),
    replyToPostId: text("reply_to_post_id"),
    replyToUri: text("reply_to_uri"),
    conversationId: text("conversation_id"),
    sensitive: boolean("sensitive").notNull().default(false),
    rawJson: jsonb("raw_json"),
    publishedAt: timestamp("published_at").notNull().defaultNow(),
    editedAt: timestamp("edited_at"),
    deletedAt: timestamp("deleted_at"),
    hiddenAt: timestamp("hidden_at"),
  },
  (table) => [
    index("posts_author_idx").on(table.authorActorId),
    index("posts_published_idx").on(table.publishedAt),
  ],
);

export const postRecipients = pgTable(
  "post_recipients",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.actorId] })],
);

export const postMentions = pgTable("post_mentions", {
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => actors.id, { onDelete: "cascade" }),
  handle: text("handle").notNull(),
});

export const activities = pgTable(
  "activities",
  {
    id: text("id").primaryKey(),
    uri: text("uri").notNull().unique(),
    direction: activityDirectionEnum("direction").notNull(),
    type: text("type").notNull(),
    actorId: text("actor_id").references(() => actors.id, { onDelete: "set null" }),
    objectUri: text("object_uri"),
    targetUri: text("target_uri"),
    rawJson: jsonb("raw_json"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("activities_actor_idx").on(table.actorId),
    index("activities_object_uri_idx").on(table.objectUri),
  ],
);

export const mediaAssets = pgTable("media_assets", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  remoteUrl: text("remote_url"),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  altText: text("alt_text").notNull().default(""),
  sensitive: boolean("sensitive").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const postMedia = pgTable(
  "post_media",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.postId, table.mediaId] })],
);

export const likes = pgTable(
  "likes",
  {
    actorId: text("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.actorId, table.postId] })],
);

export const announces = pgTable(
  "announces",
  {
    actorId: text("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.actorId, table.postId] })],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.postId] })],
);

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  actorId: text("actor_id").references(() => actors.id, { onDelete: "set null" }),
  postId: text("post_id").references(() => posts.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const domainBlocks = pgTable("domain_blocks", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  reason: text("reason").notNull().default(""),
  createdByUserId: text("created_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const deliveryJobs = pgTable("delivery_jobs", {
  id: text("id").primaryKey(),
  targetInboxUrl: text("target_inbox_url").notNull(),
  activityUri: text("activity_uri").notNull(),
  activityType: text("activity_type").notNull(),
  status: deliveryStatusEnum("status").notNull().default("queued"),
  attemptCount: integer("attempt_count").notNull().default(0),
  responseStatus: integer("response_status"),
  responseExcerpt: text("response_excerpt"),
  nextRetryAt: timestamp("next_retry_at"),
  finalFailureReason: text("final_failure_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const inboxEvents = pgTable("inbox_events", {
  id: text("id").primaryKey(),
  actorUri: text("actor_uri"),
  activityType: text("activity_type").notNull(),
  activityUri: text("activity_uri"),
  status: text("status").notNull().default("received"),
  rawJson: jsonb("raw_json"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userRelations = relations(user, ({ one }) => ({
  profile: one(profiles, {
    fields: [user.id],
    references: [profiles.userId],
  }),
}));

export const profileRelations = relations(profiles, ({ one }) => ({
  user: one(user, {
    fields: [profiles.userId],
    references: [user.id],
  }),
}));

export const postRelations = relations(posts, ({ one, many }) => ({
  author: one(actors, {
    fields: [posts.authorActorId],
    references: [actors.id],
  }),
  media: many(postMedia),
}));

export const mediaRelations = relations(postMedia, ({ one }) => ({
  post: one(posts, {
    fields: [postMedia.postId],
    references: [posts.id],
  }),
  asset: one(mediaAssets, {
    fields: [postMedia.mediaId],
    references: [mediaAssets.id],
  }),
}));

export const actorKeyRelations = relations(actorKeys, ({ one }) => ({
  actor: one(actors, {
    fields: [actorKeys.actorId],
    references: [actors.id],
  }),
}));
