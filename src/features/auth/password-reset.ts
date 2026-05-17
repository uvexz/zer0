import nodemailer from "nodemailer";
import { getSiteSettings } from "@/features/site/settings";
import { env } from "@/lib/env";

export const PASSWORD_RESET_UNAVAILABLE_MESSAGE = "暂不支持重置密码，请联系管理员配置发件信息";

type PasswordResetSmtpConfigInput = {
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
};

type PasswordResetEmailInput = {
  siteName: string;
  resetUrl: string;
};

export function hasPasswordResetSmtpConfig(config: PasswordResetSmtpConfigInput) {
  return Boolean(
    config.SMTP_HOST &&
      config.SMTP_PORT &&
      config.SMTP_USER &&
      config.SMTP_PASS &&
      config.SMTP_FROM,
  );
}

export function isPasswordResetEmailConfigured() {
  return hasPasswordResetSmtpConfig(env);
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: {
  to: string;
  resetUrl: string;
}) {
  const config = getPasswordResetSmtpConfig();
  if (!config) throw new Error(PASSWORD_RESET_UNAVAILABLE_MESSAGE);

  const settings = await getSiteSettings();
  const email = buildPasswordResetEmail({
    siteName: settings.siteName,
    resetUrl,
  });

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transport.sendMail({
    from: config.from,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

export function buildPasswordResetEmail({
  siteName,
  resetUrl,
}: PasswordResetEmailInput) {
  const safeSiteName = siteName.replace(/[\r\n]+/g, " ").trim() || "Zer0";
  const escapedSiteName = escapeHtml(safeSiteName);
  const escapedResetUrl = escapeHtml(resetUrl);

  return {
    subject: `Reset your ${safeSiteName} password`,
    text: [
      `Use this link to reset your ${safeSiteName} password:`,
      "",
      resetUrl,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      `<p>Use this link to reset your ${escapedSiteName} password:</p>`,
      `<p><a href="${escapedResetUrl}">Reset your password</a></p>`,
      "<p>If you did not request this, you can ignore this email.</p>",
    ].join(""),
  };
}

function getPasswordResetSmtpConfig() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
  } = env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    return null;
  }

  return {
    host: SMTP_HOST,
    port: SMTP_PORT,
    user: SMTP_USER,
    pass: SMTP_PASS,
    from: SMTP_FROM,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
