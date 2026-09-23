import assert from "node:assert/strict";
import test from "node:test";
import { createSession, validSession, checkAdminCredentials, checkAdminPassword, validTickSecret } from "../../src/server/auth/session.ts";

process.env.SESSION_SECRET = "a-session-secret-with-at-least-thirty-two-chars";
process.env.ADMIN_PASSWORD = "a-long-test-admin-password";
process.env.ADMIN_USERNAME = "admin";
process.env.JOB_TICK_SECRET = "a-long-test-dispatcher-secret";

test("administrator sessions expire and reject tampering", () => {
  const now = Date.UTC(2026, 8, 23);
  const token = createSession(now);
  assert.equal(validSession(token, now), true);
  assert.equal(validSession(token, now + 9 * 60 * 60 * 1000), false);
  const tampered = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
  assert.equal(validSession(tampered, now), false);
  assert.equal(validSession(undefined, now), false);
});

test("administrator and dispatcher secrets are independent", () => {
  assert.equal(checkAdminPassword("a-long-test-admin-password"), true);
  assert.equal(checkAdminPassword("wrong"), false);
  assert.equal(checkAdminCredentials("admin", "a-long-test-admin-password"), true);
  assert.equal(checkAdminCredentials("test", "a-long-test-admin-password"), false);
  assert.equal(validTickSecret("Bearer a-long-test-dispatcher-secret"), true);
  assert.equal(validTickSecret("Bearer a-long-test-admin-password"), false);
  assert.equal(validTickSecret(null), false);
});

test("short demo credentials are accepted outside production only", () => {
  const savedEnvironment = process.env.NODE_ENV;
  const savedUsername = process.env.ADMIN_USERNAME;
  const savedPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_USERNAME = "test";
  process.env.ADMIN_PASSWORD = "test";
  process.env.NODE_ENV = "development";
  assert.equal(checkAdminCredentials("test", "test"), true);
  assert.equal(checkAdminCredentials("other", "test"), false);
  process.env.NODE_ENV = "production";
  assert.throws(() => checkAdminCredentials("test", "test"));
  if (savedEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedEnvironment;
  process.env.ADMIN_USERNAME = savedUsername;
  process.env.ADMIN_PASSWORD = savedPassword;
});

test("published placeholder secrets cannot authenticate", () => {
  const saved = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "replace-with-strong-random-value";
  assert.throws(() => checkAdminPassword("replace-with-strong-random-value"));
  process.env.ADMIN_PASSWORD = saved;
});
