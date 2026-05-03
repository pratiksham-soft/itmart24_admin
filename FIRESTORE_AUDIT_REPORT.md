# Firestore Audit Report

Date: 2026-04-23

## Root Causes Found

- Shopify storefront analytics was still initializing client-side impression, view, click, and heartbeat tracking from theme JavaScript.
- Vendor portal analytics was writing too many side-effect documents per event, including optional raw event logs and analytics-hit notifications.
- Notification reads were doing extra Firestore work on every fetch, including repeated sync scans and unread count full reads.
- Dashboard and monthly target endpoints were repeatedly scanning full collections on normal page loads.
- Shopify product import was reading the full `products` collection up front before processing each Shopify batch.
- Repeated vendor profile lookups and subscription lookups were being refetched instead of reused.
- Product status updates could resync/write even when the requested lifecycle state was already current.
- Product search requests were firing on every keystroke without debounce.

## Files Fixed

### `shopify_theme`

- `assets/itmart-compare.js`

### `itmart24_admin`

- `backend/src/utils/enrichProductsWithVendors.ts`
- `backend/src/services/notifications.service.ts`
- `backend/src/services/shopifyProductImport.ts`
- `backend/src/services/dashboard.service.ts`
- `backend/src/services/monthlyTargets.service.ts`
- `backend/src/routes/products.routes.ts`
- `frontend/src/services/supportTickets.service.ts`
- `frontend/src/components/header/NotificationDropdown.tsx`
- `frontend/src/pages/Products/usePaginatedStatusProducts.ts`

### `vendor_portal`

- `backend/controllers/analytics.controller.js`
- `backend/services/notification.service.js`
- `frontend/src/firebase/subscriptionReadService.js`
- `frontend/src/components/subscription/SubscriptionPopup.jsx`
- `frontend/src/components/verification/VerificationPopup.jsx`
- `frontend/src/pages/Products.jsx`
- `frontend/src/pages/performance/Performance.jsx`

## Read Reduction Changes

- Added process-level vendor profile caching for admin-side product enrichment.
- Added frontend caching/deduping for admin support ticket vendor profile reads.
- Added vendor portal shared subscription read caching to stop duplicate `subscriptions` queries across popups and analytics pages.
- Replaced vendor portal product/performance subscription listeners with one-time reads where live updates were not business-critical.
- Reduced admin notification unread counting to Firestore `count()` aggregation instead of loading unread documents.
- Added short-lived notification fetch staleness protection in the admin dropdown.
- Added short-lived server-side dashboard collection caching for repeated dashboard/monthly-target requests.
- Reworked vendor portal notification listing to use Firestore query filters plus `count()` instead of loading and sorting all notifications in memory.
- Replaced full-collection Shopify import duplicate detection with per-batch `getAll(...)` existence checks.
- Debounced admin product search requests to reduce repeated full-search fetches while typing.

## Write Reduction Changes

- Temporarily disabled Shopify theme analytics initialization to stop storefront-driven Firestore-heavy analytics traffic.
- Disabled vendor portal analytics-hit notifications by default unless `ENABLE_ANALYTICS_HIT_NOTIFICATIONS=true`.
- Disabled raw analytics event logging by default unless `ENABLE_ANALYTICS_EVENT_LOGGING=true`.
- Normalized and validated analytics event types/session IDs before writes.
- Ignored `TIME_SPENT` events without a valid session instead of creating noisy/invalid writes.
- Prevented duplicate admin product lifecycle writes when the requested state was already current.
- Collapsed admin active-status Shopify sync persistence into a single Firestore update instead of multiple sequential updates.
- Skipped monthly target writes when the effective document payload had not changed.

## Temporarily Commented In Shopify Theme

- File: `shopify_theme/assets/itmart-compare.js`
  Line: `1516`
  Exact commented line: `// initCollectionImpressionTracking();`
- File: `shopify_theme/assets/itmart-compare.js`
  Line: `1517`
  Exact commented line: `// initProductPageAnalytics();`

## Recommended Heatmap / Analytics Architecture

- Stop sending direct client-to-Firestore analytics writes from theme code.
- Buffer client events in memory and `sendBeacon` or POST only summarized batches every 30 to 60 seconds, on visibility change, and on unload.
- Send batches to a backend ingestion endpoint, not Firestore directly.
- Deduplicate by `sessionId + productId + eventType + time bucket`.
- Store only bucketed aggregates for reporting:
  - hourly impression/view/click counters
  - session-level total time spent
  - daily source/device/geo rollups
- Make raw event logging optional and sampled, not default.
- Run heavier aggregation or snapshot generation server-side on a schedule.

### Best Practical Approach For This Codebase

- Keep the existing backend analytics endpoints.
- Change the storefront to batch and throttle events before sending.
- Keep Firestore writes limited to aggregated docs plus session summaries.
- Do not create a notification document for each analytics hit.
- Keep raw event collection behind an explicit env flag for debugging only.

## Remaining Risky Areas

- Admin product search still falls back to broad server-side search reads because the current schema does not support indexed search across all displayed fields.
- Admin product list pagination still uses page-number pagination on the server; a cursor-based API would reduce deep-page read cost further.
- Vendor portal analytics controller still contains legacy logic paths and would benefit from a second cleanup pass once the new analytics batching design is implemented.
- Any scripts run manually against Firestore can still be expensive if used frequently; they were not changed unless they were part of normal app flows.
