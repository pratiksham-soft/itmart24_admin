const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPushMessageForCategory,
  isSafeInternalAdminTarget,
  normalizeNotificationCategory,
  normalizeNotificationSeverity,
  sanitizeNotificationMetadata,
  sanitizeTargetUrl,
} = require("../src/services/adminNotifications.helpers.ts");

test("sanitizeTargetUrl allows only safe internal admin paths", () => {
  assert.equal(sanitizeTargetUrl("/vendors?vendorId=abc"), "/vendors?vendorId=abc");
  assert.equal(sanitizeTargetUrl("/products/pending?productId=123"), "/products/pending?productId=123");
  assert.equal(sanitizeTargetUrl("https://example.com/phishing"), "/notifications");
  assert.equal(sanitizeTargetUrl("//evil.test/path"), "/notifications");
  assert.equal(sanitizeTargetUrl("javascript:alert(1)"), "/notifications");
  assert.equal(isSafeInternalAdminTarget("/notifications"), true);
  assert.equal(isSafeInternalAdminTarget("/../../admin"), false);
});

test("sanitizeNotificationMetadata removes sensitive keys recursively", () => {
  const sanitized = sanitizeNotificationMetadata({
    userId: "user-1",
    paymentStatus: "success",
    accessToken: "secret",
    nested: {
      provider: "razorpay",
      signature: "abc123",
      cardLast4: "4242",
      amount: 299,
    },
    items: [
      { plan: "Starter", auth: "top-secret" },
      "visible",
    ],
  });

  assert.deepEqual(sanitized, {
    userId: "user-1",
    paymentStatus: "success",
    nested: {
      provider: "razorpay",
      amount: 299,
    },
    items: [
      { plan: "Starter" },
      "visible",
    ],
  });
});

test("notification enums and push messages stay normalized", () => {
  assert.equal(normalizeNotificationCategory("payments"), "payments");
  assert.equal(normalizeNotificationCategory("unknown"), null);
  assert.equal(normalizeNotificationSeverity("error"), "error");
  assert.equal(normalizeNotificationSeverity("critical"), null);
  assert.equal(
    buildPushMessageForCategory("payments"),
    "New payment activity was recorded."
  );
});
