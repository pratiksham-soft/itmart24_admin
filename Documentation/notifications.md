# Admin Notifications

## Overview

ITMart24 Admin now uses a single notification system for:

- In-app admin notifications
- Real-time unread badge/dropdown updates
- Browser push notifications for opted-in admin devices

The implementation extends the existing admin notification area instead of creating a parallel system.

## Architecture

### Persistence model

Notifications are stored in the analytics PostgreSQL database with a shared-event plus per-admin-recipient design:

- `admin_notification_events`
  - One row per business event
  - Contains event identity, category, title, message, severity, safe target URL, metadata, and idempotency key
- `admin_notification_recipients`
  - One row per admin per notification event
  - Stores read and archive state privately for each admin
- `admin_notification_preferences`
  - Per-admin browser push category toggles
- `admin_push_subscriptions`
  - One row per admin device/browser subscription
- `admin_notification_sync_state`
  - Cursor state for cross-system event synchronization

This avoids the previous shared read-state issue and keeps unread/read state isolated by admin.

### Delivery flow

1. Source data is detected from already-implemented platform data stores.
2. A notification event is inserted exactly once using a unique `event_key`.
3. Recipient rows are created for every active admin.
4. Server-Sent Events notify connected admin sessions to refresh unread counts and lists.
5. Browser push is attempted asynchronously for subscribed devices that still have the matching category enabled.

Push delivery failures never roll back the notification record or business event.

### Real-time transport

- In-app real-time updates use authenticated Server-Sent Events at `GET /api/notifications/stream`
- Browser `EventSource` connections authenticate with the existing admin token through an `accessToken` query parameter because the EventSource API cannot send custom headers
- Events emitted:
  - `notifications-updated`
  - `notification-read`
  - `notifications-read-all`
  - `notification-archived`
  - `preferences-updated`
  - `push-subscription-updated`

## Event Mapping

### Vendors

- Event: `vendor.registered`
- Trigger source: Firestore `vendor_profile`
- Trigger point: after a persisted vendor record exists with `createdAt`
- Target URL: `/vendors?vendorId={vendorId}`
- Idempotency key: `vendor.registered:{vendorId}`

### Products

- Event: `product.submitted`
- Trigger source: Firestore `products`
- Trigger point: product is currently in pending lifecycle state and has a submission timestamp signal
- Target URL: `/products/pending?productId={productId}`
- Idempotency key: `product.submitted:{productId}:{submissionVersion}`

Notes:

- The current source model does not expose a clear dedicated resubmission counter/version field.
- The implementation uses the safest available submission timestamp signal from existing fields such as `resubmittedAt`, `submittedAt`, `reviewSubmittedAt`, `pendingSince`, or falls back to the original create timestamp when needed.
- Ordinary non-submission edits are not notified unless the submission-version signal changes.

### Users

- Event: `user.registered`
- Trigger source: `user_portal.users`
- Trigger point: after the user row is committed with `created_at`
- Target URL: `/users`
- Idempotency key: `user.registered:{userId}`

### Guest Reports

- Event: `guest-report.generated`
- Trigger source:
  - `user_portal.guest_report`
  - `user_portal.guest_activity_events`
- Trigger point: only when the report is actually generated and stored
- Required signal:
  - `report_generated_at`, or
  - a generated-event name such as `SEOHealthReportGenerated`, `AIAnalysisReportGenerated`, or `CompetitorReportGenerated`
- Target URL: `/users/guest-users`
- Idempotency key: `guest-report.generated:{reportId}`

This intentionally excludes preview-only, failed, abandoned, or validation-only attempts.

### Payments

Current payment coverage is based on the source events already implemented in `user_portal`.

- Providers identified:
  - Razorpay
  - PayPal
- Source tables:
  - `user_plan_payment_transactions`
  - `user_plan_orders`

Supported notification events in this repository today:

- `payment.initiated`
  - Triggered from `order_created` and `gateway_order_created`
- `payment.succeeded`
  - Triggered from `payment_verified`
- `payment.failed`
  - Triggered from failed terminal order statuses such as `failed`, `payment_failed`, and `cancelled`

Target URL currently falls back to `/users` because this admin repository does not yet expose a dedicated payment detail route.

Idempotency keys:

- `payment:{provider}:{transactionId}:{status}` for transaction-driven events
- `payment:{provider}:{orderId}:{status}` for order-status-driven failure events

Current limitations:

- No existing refund workflow was found in this repository or the connected source flows inspected
- No existing chargeback/dispute event handling was found
- No explicit subscription renewal success/failure source event was found in the connected source flows inspected

Those event groups require upstream source support before admin notifications can be emitted accurately.

## API Endpoints

All notification endpoints require authenticated admin access.

- `GET /api/notifications`
  - Paginated list with filters
- `GET /api/notifications/stream`
  - SSE stream for in-app real-time updates
- `PATCH /api/notifications/:notificationId/read`
  - Mark one notification as read
- `POST /api/notifications/read-all`
  - Mark all notifications as read
- `PATCH /api/notifications/:notificationId/archive`
  - Archive one notification
- `POST /api/notifications/sync`
  - Manual sync trigger for administrative verification
- `GET /api/notifications/preferences`
  - Read per-category browser push preferences
- `PUT /api/notifications/preferences`
  - Update per-category browser push preferences
- `GET /api/notifications/push`
  - Push capability/configuration status for the current admin
- `GET /api/notifications/push/subscriptions`
  - Current admin device subscriptions
- `POST /api/notifications/push/subscriptions`
  - Save or update a device subscription
- `DELETE /api/notifications/push/subscriptions`
  - Disable the current device subscription

### Supported filters

- `category`
- `type`
- `severity`
- `readStatus`
- `archived`
- `page`
- `pageSize`

## Frontend Behavior

### Header dropdown

The admin header notification dropdown now includes:

- unread badge
- recent notifications
- relative timestamps
- read/unread styling
- per-item navigation
- mark-all-read action
- browser push enable/disable action
- view-all link
- empty/loading/error handling

### Notifications page

Route: `/notifications`

Capabilities:

- pagination
- filters for category, severity, and read state
- mark one as read
- mark all as read
- archive action
- browser push preference toggles by category
- current-device browser push controls

### Notification click behavior

- Vendors open `/vendors?vendorId={vendorId}` and auto-open the vendor detail modal
- Pending products open `/products/pending?productId={productId}` and auto-open the product detail modal
- Other categories fall back to the safest existing admin route currently available

## Browser Push Setup

### Required environment variables

Add these to the backend runtime environment:

```env
WEB_PUSH_PUBLIC_KEY=
WEB_PUSH_PRIVATE_KEY=
WEB_PUSH_SUBJECT=mailto:notifications@example.com
```

Safe placeholders are included in [backend/.env.example](../backend/.env.example).

### Generate VAPID keys

Run this once in a secure local environment:

```bash
npx web-push generate-vapid-keys
```

Store the generated private key only in secured runtime secrets storage. Never commit it.

### Service worker

Frontend push handling is implemented in:

- `frontend/public/admin-notification-sw.js`

Behavior:

- displays concise lock-screen-safe messages
- restricts click targets to internal admin routes
- focuses an existing admin window when possible
- opens a new admin window when no existing window is available

### Browser limitations

- Push requires Service Worker and Push API support
- Permission is only requested after an admin explicitly clicks the enable action
- Browsers that do not support Push API continue to receive in-app notifications normally

## Security and Privacy

- Notification target URLs are restricted to safe internal admin routes
- Sensitive fields such as passwords, OTPs, tokens, signatures, card data, and secret values are stripped from metadata
- Push notifications use short generic bodies to reduce lock-screen exposure
- Full push subscription secrets are stored for delivery but should not be logged
- Invalid push subscriptions returning HTTP `404` or `410` are deactivated automatically
- A push send failure never breaks registration, product review flow, guest report generation, or payment processing state

## Database Changes

The analytics database bootstrap now ensures:

- `admin_notification_events`
- `admin_notification_recipients`
- `admin_notification_sync_state`
- `admin_push_subscriptions`
- `admin_notification_preferences`

Indexes were added for:

- notification `event_key` uniqueness
- recipient unread/archive lookups
- category/type/severity access patterns
- created/occurred timestamps
- active push subscriptions by admin

## Local Verification

### Build and lint

Run from `itmart24_admin`:

```bash
npm run build
npm run build --prefix backend
npm run build --prefix frontend
npm run lint --prefix frontend
npm run test --prefix backend
```

### Manual verification checklist

1. Sign in as an admin and open `/notifications`
2. Verify the dropdown unread badge updates without a full refresh
3. Trigger or sync each source event group
4. Click a vendor notification and confirm the vendor modal opens
5. Click a pending-product notification and confirm the product modal opens
6. Enable browser push for the current device and confirm a subscription is saved
7. Deny browser permission and confirm in-app notifications still work
8. Disable browser push and confirm the subscription is removed
9. Re-send a duplicate payment webhook/source event and confirm no duplicate notification is created

## Deployment Notes

- Ensure the backend environment includes valid VAPID keys before enabling browser push in production
- The service worker file must be served from the frontend app root as `/admin-notification-sw.js`
- If admin auth token shape changes, keep SSE token propagation aligned with `getAdminEventStreamUrl()`
- Review CSP and reverse-proxy rules to ensure SSE responses are not buffered incorrectly

## Known Limitations and Cross-Project Dependencies

- This admin repository does not own the primary user registration, guest report generation, or payment processing business flows
- Notifications for those domains are sourced from the connected `user_portal` database tables that already persist the verified results
- Refund, dispute/chargeback, and explicit subscription-renewal notifications were not implemented because no reliable upstream event source or admin route was present during inspection
- Payment notifications currently navigate to `/users` because no dedicated payment details route exists in this admin frontend
- Automated notification-flow integration coverage is limited by the absence of a pre-existing end-to-end test harness in this repository and by the cross-repository nature of the event sources
