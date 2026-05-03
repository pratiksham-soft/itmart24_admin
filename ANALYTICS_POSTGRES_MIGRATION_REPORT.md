# Analytics Firestore -> PostgreSQL Migration

## Scope
- Projects reviewed: `vendor_portal`, `itmart24_admin`, `shopify_theme`
- Analytics-related Firestore usage migrated to PostgreSQL
- Non-analytics Firestore collections were left in place

## Root Causes Found
- Vendor analytics events, daily aggregates, snapshots, AI insight snapshots, and weekly reports were stored in Firestore
- Admin ranking sync was reading `analytics_preaggregated` from Firestore
- Shopify theme analytics sent many single-event requests instead of batching
- A legacy Shopify section variant still contained duplicate inline analytics code
- Vendor demo seeding still wrote analytics collections into Firestore

## PostgreSQL Changes
- Added pooled PostgreSQL analytics connection utilities with lazy-safe initialization
- Added `ensureDatabase()` logic to create `itmart24_analytics` when missing
- Added `ensureTables()` logic to auto-create analytics tables before query execution
- Added PostgreSQL tables for:
  - `analytics_daily_summary`
  - `analytics_daily_breakdown`
  - `analytics_daily_geo`
  - `analytics_hourly_aggregation`
  - `analytics_product_daily_sessions`
  - `analytics_events`
  - `analytics_snapshots`
  - `analytics_preaggregated`
  - `ai_insight_snapshots`
  - `ai_weekly_reports`

## Firestore Logic Removed Or Replaced
- `vendor_portal/backend/controllers/analytics.controller.js`
  - Replaced analytics Firestore reads/writes with PostgreSQL-backed reads/writes
  - Added batched analytics endpoint support
- `vendor_portal/backend/controllers/aiInsights.controller.js`
  - Replaced analytics reads and AI snapshot/report writes with PostgreSQL
- `vendor_portal/backend/services/aiInsightsCron.service.js`
  - Replaced analytics snapshot/preaggregation Firestore writes with PostgreSQL upserts
- `vendor_portal/backend/scripts/seedAIInsights.js`
  - Replaced analytics Firestore seeding with PostgreSQL writes
- `itmart24_admin/backend/src/services/productRankingSync.service.ts`
  - Replaced Firestore `analytics_preaggregated` reads with PostgreSQL reads
- `itmart24_admin/backend/src/scripts/exportFirestoreToJson.ts`
  - Removed analytics collection as the default export target

## New PostgreSQL Files
- `vendor_portal/backend/services/postgres.service.js`
- `vendor_portal/backend/services/analyticsPostgres.service.js`
- `itmart24_admin/backend/src/services/analyticsPostgres.service.ts`
- `itmart24_admin/backend/src/types/pg.d.ts`

## Shopify Theme Changes
- `shopify_theme/assets/itmart-compare.js`
  - Re-enabled analytics tracking after backend storage migration
  - Switched storefront analytics calls to client-side batching with `/api/analytics/batch`
  - Added token caching and flush-on-hide/pagehide behavior
- `shopify_theme/sections/main-product-copy.liquid`
  - Removed duplicate inline analytics scripts
  - Replaced with the shared analytics config block used by the main section

## Backend Startup Changes
- `vendor_portal/backend/server.js`
  - Initializes analytics PostgreSQL on server boot
- `itmart24_admin/backend/src/server.ts`
  - Initializes analytics PostgreSQL on server boot

## Dependencies Added
- `pg` added to:
  - `vendor_portal/backend/package.json`
  - `itmart24_admin/backend/package.json`

## Verification Completed
- `vendor_portal` backend syntax checks passed for:
  - analytics controller
  - AI insights controller
  - PostgreSQL analytics services
  - analytics cron service
  - analytics seed script
- `itmart24_admin` backend TypeScript build passed
- `vendor_portal` frontend build passed
- `itmart24_admin` frontend build passed

## PostgreSQL Verification
- Verified backend connectivity to PostgreSQL database `itmart24_analytics`
- Verified automatic schema creation for:
  - `analytics_daily_summary`
  - `analytics_daily_breakdown`
  - `analytics_daily_geo`
  - `analytics_hourly_aggregation`
  - `analytics_product_daily_sessions`
  - `analytics_events`
  - `analytics_snapshots`
  - `analytics_preaggregated`
  - `ai_insight_snapshots`
  - `ai_weekly_reports`

## Remaining Risk Areas
- Reference/schema files still describe the old Firestore analytics collections for historical documentation only
- Managed PostgreSQL settings such as SSL, admin database name, or connection timeout may still need environment tuning on other machines, but the current backend bootstrap now supports those cases
