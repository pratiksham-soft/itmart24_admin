const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeB2BOperatingSystem,
  normalizeB2BBrowser,
  classifyB2BDeviceSegment,
  classifyB2BDownload,
  calculateSafeRate,
} = require("../src/services/visitorAnalytics.service.ts");

test("normalizeB2BOperatingSystem keeps Windows, mobile, and unknown values distinct", () => {
  assert.equal(normalizeB2BOperatingSystem("Windows 11"), "Windows");
  assert.equal(normalizeB2BOperatingSystem("android"), "Android");
  assert.equal(normalizeB2BOperatingSystem("iOS 18"), "iOS / iPadOS");
  assert.equal(normalizeB2BOperatingSystem("Linux Mint"), "Linux");
  assert.equal(normalizeB2BOperatingSystem(""), "Other / Unknown");
  assert.equal(normalizeB2BOperatingSystem(null), "Other / Unknown");
});

test("normalizeB2BBrowser preserves Meta in-app browser labels", () => {
  assert.equal(normalizeB2BBrowser("Instagram 322.0"), "Instagram in-app browser");
  assert.equal(normalizeB2BBrowser("Facebook App Browser"), "Facebook in-app browser");
  assert.equal(normalizeB2BBrowser("Microsoft Edge"), "Edge");
  assert.equal(normalizeB2BBrowser(""), "Other / Unknown");
});

test("classifyB2BDeviceSegment separates Windows desktop from mobile and unknown traffic", () => {
  assert.equal(classifyB2BDeviceSegment("desktop", "Windows"), "Windows desktop");
  assert.equal(classifyB2BDeviceSegment("mobile", "Android"), "Android");
  assert.equal(classifyB2BDeviceSegment("tablet", "iOS"), "iPhone/iPad");
  assert.equal(classifyB2BDeviceSegment("desktop", "macOS"), "macOS");
  assert.equal(classifyB2BDeviceSegment("desktop", "Linux"), "Linux");
  assert.equal(classifyB2BDeviceSegment("unknown", "Other / Unknown"), "Other / Unknown");
});

test("classifyB2BDownload excludes Android and iOS .exe downloads from valid Windows downloads", () => {
  assert.equal(classifyB2BDownload("desktop", "Windows"), "Valid Windows download");
  assert.equal(classifyB2BDownload("mobile", "Android"), "Mobile .exe download");
  assert.equal(classifyB2BDownload("mobile", "iOS"), "Mobile .exe download");
  assert.equal(classifyB2BDownload("desktop", "macOS"), "Other non-Windows download");
  assert.equal(classifyB2BDownload("unknown", "Other / Unknown"), "Unknown device");
});

test("calculateSafeRate returns zero for empty denominators and rounds to one decimal place", () => {
  assert.equal(calculateSafeRate(0, 0), 0);
  assert.equal(calculateSafeRate(1, 0), 0);
  assert.equal(calculateSafeRate(1, 3), 33.33333333333333);
  assert.equal(calculateSafeRate(2, 3), 66.66666666666666);
});
