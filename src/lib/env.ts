import { z } from "zod";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const optionalEmail = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.email().optional(),
);

const optionalNumber = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().optional(),
);

const optionalPositiveInteger = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const optionalBoolean = z.preprocess(
  (value) => {
    if (value === "") return undefined;
    if (typeof value === "string") return value === "true" || value === "1";
    return value;
  },
  z.boolean().optional(),
);

const envSchema = z.object({
  APP_ORIGIN: z.url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16).default("zer0-dev-auth-secret-change-me-please"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/zer0"),
  DATABASE_MAX_CONNECTIONS: optionalPositiveInteger,
  FEDERATION_CACHE_TTL_SECONDS: optionalPositiveInteger,
  REDIS_URL: z.string().default("redis://localhost:6379"),
  MEDIA_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  MEDIA_LOCAL_DIR: z.string().default(".zer0/media"),
  MEDIA_S3_BUCKET: optionalString,
  MEDIA_S3_REGION: z.string().default("us-east-1"),
  MEDIA_S3_ENDPOINT: optionalString,
  MEDIA_S3_ACCESS_KEY_ID: optionalString,
  MEDIA_S3_SECRET_ACCESS_KEY: optionalString,
  MEDIA_S3_PUBLIC_BASE_URL: optionalString,
  MEDIA_S3_FORCE_PATH_STYLE: optionalBoolean,
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalNumber,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalEmail,
});

export const env = envSchema.parse({
  APP_ORIGIN: process.env.APP_ORIGIN ?? process.env.BETTER_AUTH_URL,
  AUTH_SECRET: process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET,
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_MAX_CONNECTIONS: process.env.DATABASE_MAX_CONNECTIONS,
  FEDERATION_CACHE_TTL_SECONDS: process.env.FEDERATION_CACHE_TTL_SECONDS,
  REDIS_URL: process.env.REDIS_URL,
  MEDIA_STORAGE_DRIVER: process.env.MEDIA_STORAGE_DRIVER,
  MEDIA_LOCAL_DIR: process.env.MEDIA_LOCAL_DIR,
  MEDIA_S3_BUCKET: process.env.MEDIA_S3_BUCKET,
  MEDIA_S3_REGION: process.env.MEDIA_S3_REGION,
  MEDIA_S3_ENDPOINT: process.env.MEDIA_S3_ENDPOINT,
  MEDIA_S3_ACCESS_KEY_ID: process.env.MEDIA_S3_ACCESS_KEY_ID,
  MEDIA_S3_SECRET_ACCESS_KEY: process.env.MEDIA_S3_SECRET_ACCESS_KEY,
  MEDIA_S3_PUBLIC_BASE_URL: process.env.MEDIA_S3_PUBLIC_BASE_URL,
  MEDIA_S3_FORCE_PATH_STYLE: process.env.MEDIA_S3_FORCE_PATH_STYLE,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
});
