# Visitors Analytics

## Purpose

The Admin Visitors page provides first-party visitor analytics for:

- `user_portal`
- `vendor_portal`

It is available only to authenticated Admin users through `Dashboard > Visitors`.

## What It Shows

- overview summary cards for live, today, and last-7-day activity
- portal split and device distribution
- top countries, cities, pages, referrers, and UTM campaigns
- live visitors with session drill-down
- filterable visitor, location, and page analytics tables
- visitor detail and session detail modals

## Data Model

The feature stores reporting data in the shared analytics PostgreSQL database using:

- `analytics_visitors`
- `analytics_visitor_sessions`
- `analytics_visitor_page_views`

These tables are initialized through the existing analytics database bootstrap so no separate destructive migration flow was introduced.

## Admin API Endpoints

Protected routes under Admin auth:

- `GET /api/admin/visitors/summary`
- `GET /api/admin/visitors/live`
- `GET /api/admin/visitors`
- `GET /api/admin/visitors/locations`
- `GET /api/admin/visitors/pages`
- `GET /api/admin/visitors/trends`
- `GET /api/admin/visitors/:visitorId`
- `GET /api/admin/visitors/sessions/:sessionId`

`GET /api/admin/visitors?format=csv` exports the currently filtered visitor list as CSV.

## Visitor And Session Rules

- unique visitor: distinct first-party anonymous visitor ID
- session: reset after 30 minutes of inactivity by default
- live visitor: a session with activity inside the last 5 minutes by default
- today and last 7 days: calculated in `VISITOR_ANALYTICS_TIMEZONE`, default `Asia/Kolkata`

## Privacy Protections

- no raw IP address is exposed in the Admin UI
- visitor rows store masked IP and hash, not full IP output for operators
- URLs are sanitized before storage and keep only safe UTM query fields
- no form contents, OTP values, passwords, or payment details are tracked
- approximate location is resolved server-side only

## Environment Variables

- `VISITOR_ANALYTICS_ENABLED`
- `VISITOR_ANALYTICS_ALLOWED_ORIGINS`
- `VISITOR_SESSION_TIMEOUT_MINUTES`
- `LIVE_VISITOR_WINDOW_MINUTES`
- `VISITOR_ANALYTICS_RETENTION_DAYS`
- `VISITOR_ANALYTICS_TIMEZONE`
- `GEOLOCATION_PROVIDER`
- `GEOLOCATION_API_KEY`
- `VISITOR_ANALYTICS_TRUST_PROXY_HEADERS`

## Current Notes

- location resolution currently prefers trusted CDN or hosting headers; if none are present the UI shows `Unknown`
- live visitor data refreshes through polling, not WebSockets
- the page keeps filters in the query string so links are shareable inside the Admin app
