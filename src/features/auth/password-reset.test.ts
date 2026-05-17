import { describe, expect, it } from "vitest";
import {
  buildEmailVerificationEmail,
  buildPasswordResetEmail,
  hasPasswordResetSmtpConfig,
} from "./password-reset";

describe("password reset email", () => {
  it("requires every SMTP setting before password reset is enabled", () => {
    expect(hasPasswordResetSmtpConfig({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: 587,
      SMTP_USER: "user",
      SMTP_PASS: "pass",
      SMTP_FROM: "noreply@example.com",
    })).toBe(true);

    expect(hasPasswordResetSmtpConfig({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: 587,
      SMTP_USER: "user",
      SMTP_PASS: "pass",
    })).toBe(false);
  });

  it("escapes reset email HTML", () => {
    const email = buildPasswordResetEmail({
      siteName: "<Zer0>",
      resetUrl: "https://example.com/reset?token=<token>",
    });

    expect(email.subject).toBe("Reset your <Zer0> password");
    expect(email.html).toContain("&lt;Zer0&gt;");
    expect(email.html).toContain("token=&lt;token&gt;");
  });

  it("escapes verification email HTML", () => {
    const email = buildEmailVerificationEmail({
      siteName: "<Zer0>",
      verificationUrl: "https://example.com/verify?token=<token>",
    });

    expect(email.subject).toBe("Verify your <Zer0> email");
    expect(email.html).toContain("&lt;Zer0&gt;");
    expect(email.html).toContain("token=&lt;token&gt;");
  });
});
