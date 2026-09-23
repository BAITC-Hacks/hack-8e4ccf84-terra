import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "terra_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32 || value.startsWith("replace-with-")) throw new Error("SESSION_SECRET must contain at least 32 non-placeholder characters");
  return value;
}

export function checkAdminPassword(password: string): boolean {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured || configured.startsWith("replace-with-") || (process.env.NODE_ENV === "production" && configured.length < 12))
    throw new Error("ADMIN_PASSWORD must contain at least 12 non-placeholder characters in production");
  return equal(createHash("sha256").update(password).digest("hex"), createHash("sha256").update(configured).digest("hex"));
}

export function checkAdminCredentials(username: string, password: string): boolean {
  const configuredUsername = process.env.ADMIN_USERNAME?.trim() || "admin";
  return equal(username, configuredUsername) && checkAdminPassword(password);
}

export function createSession(now = Date.now()): string {
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  const body = `admin.${expires}`;
  const mac = createHmac("sha256", secret()).update(body).digest("hex");
  return `${body}.${mac}`;
}

export function validSession(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const match = /^admin\.(\d{10,})\.([a-f0-9]{64})$/.exec(token);
  if (!match || Number(match[1]) <= Math.floor(now / 1000)) return false;
  const body = `admin.${match[1]}`;
  return equal(createHmac("sha256", secret()).update(body).digest("hex"), match[2]);
}

export function validTickSecret(header: string | null): boolean {
  const configured = process.env.JOB_TICK_SECRET;
  if (!configured || configured.length < 12 || configured.startsWith("replace-with-")) throw new Error("JOB_TICK_SECRET must contain at least 12 non-placeholder characters");
  if (!header?.startsWith("Bearer ")) return false;
  return equal(createHash("sha256").update(header.slice(7)).digest("hex"), createHash("sha256").update(configured).digest("hex"));
}
