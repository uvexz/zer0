import { describe, expect, it } from "vitest";
import { redisOptionsFromUrl } from "./redis";

describe("redisOptionsFromUrl", () => {
  it("parses a basic redis URL", () => {
    expect(redisOptionsFromUrl("redis://localhost:6379")).toMatchObject({
      host: "localhost",
      port: 6379,
    });
  });

  it("parses auth and database options", () => {
    expect(redisOptionsFromUrl("redis://user:p%40ss@example.com:6380/2")).toMatchObject({
      host: "example.com",
      port: 6380,
      username: "user",
      password: "p@ss",
      db: 2,
    });
  });

  it("enables TLS for rediss URLs", () => {
    expect(redisOptionsFromUrl("rediss://cache.example.com")).toMatchObject({
      host: "cache.example.com",
      port: 6379,
      tls: {},
    });
  });

  it("rejects non-numeric database paths", () => {
    expect(() => redisOptionsFromUrl("redis://localhost/cache")).toThrow(
      "REDIS_URL database must be an integer",
    );
  });
});
