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

const envSchema = z.object({
  APP_ORIGIN: z.url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16).default("zer0-dev-auth-secret-change-me-please"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/zer0"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  MEDIA_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  MEDIA_LOCAL_DIR: z.string().default(".zer0/media"),
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
  REDIS_URL: process.env.REDIS_URL,
  MEDIA_STORAGE_DRIVER: process.env.MEDIA_STORAGE_DRIVER,
  MEDIA_LOCAL_DIR: process.env.MEDIA_LOCAL_DIR,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
});
