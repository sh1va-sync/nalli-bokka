# Developer Overview: Frontend/Backend Consistency Audit

## Audit scope

This review traced the customer and store-dashboard frontend flows against the Express routes, validation schemas, controllers, Mongoose models, API references, and the existing automated tests. Findings below are verified integration or operational inconsistencies that were corrected. The scope was the implemented stage-one storefront and store portal; intentionally unavailable features are called out separately.

## Findings and resolutions

| # | Area | Inconsistency | Resolution |
| --- | --- | --- | --- |
| 1 | Customer registration | OTP verification returns `{ isNewUser: true, verificationToken }` for a new phone, but the frontend treated every successful verification as `{ token, user }`. New customers could not finish signing in. | Added the `/auth/users/register` RTK Query mutation and a registration step that submits the short-lived token, required name, and optional email. Existing-user OTP sign-in remains unchanged. |
| 2 | Checkout/payment lifecycle | Checkout persisted an unpaid order and removed cart items before the customer completed Razorpay payment, leaving active orders after failure or dismissal. | Checkout now persists only a short-lived `CheckoutAttempt`. The server creates the paid order, transaction, and placed notification only after Razorpay confirms a captured payment; failures create no order and leave cart items intact. The prepayment `POST /orders` route was removed. |
| 3 | Razorpay webhook deduplication | Webhook records used `payment.id` as the event deduplication key. A later event type for the same payment could be acknowledged as a duplicate and never update payment state. | Handled events now require and deduplicate on Razorpay's `x-razorpay-event-id`; payment IDs remain transaction data. Webhook persistence/settlement failures now flow through the central error handler. |
| 4 | Store daily metrics and lists | The dashboard counted local-day orders and transactions from only page 1 (100 rows), so “today” totals and table contents could be incomplete. Inventory, orders, and transactions also had no controls to move beyond their first API page. | The dashboard query accepts a paired `from`/`to` interval and MongoDB aggregates exact counts/revenue over those boundaries. List endpoints now accept bounded time filters where needed, and inventory, today's orders, and today's transactions have next/previous pagination controls. The dashboard's shared date picker now lets stores view a chosen local day across metrics, orders, and transactions. |
| 5 | API documentation drift | API references described name/email in the OTP verification request, omitted the implemented registration endpoint, and documented the previous idempotency and webhook defects as current behavior. | Updated the backend and frontend API references, backend implementation guide, database design guides, and app READMEs to match the live contract and corrected behavior. |
| 6 | Backend observability | Requests had no consistent completion logs or correlation ID; only selected server errors were printed, making normal API activity difficult to trace in a live console. | Added structured JSON console logs for each completed HTTP request, a response `X-Request-Id`, structured 5xx/startup/database events, and request IDs on centralized error logs. Sensitive bodies, headers, and query values are not logged. |
| 7 | Model inventory test | The model inventory assertion did not cover all operational collections. | The model test now checks all ten collections, including `CheckoutAttempt` and `Notification`. |
| 8 | OTP provider | Customer OTP delivery and verification depended on Twilio Verify, separate from the existing Firebase project. | Replaced Twilio with Firebase Phone Authentication in the frontend, including invisible reCAPTCHA; the API verifies Firebase ID tokens with Firebase Admin and derives the verified phone from token claims. Removed the Twilio endpoint, SDK, and environment variables. |

## Follow-up improvements implemented

- Added `GET /health/ready` as a database-aware readiness probe, distinct from the existing HTTP liveness endpoint.
- Added an in-app customer notification center. Store fulfillment status changes and notification creation are committed together; customers can list notifications, see an unread count, and mark one or all as read. The frontend shows a badge and notification page. No external messaging provider is used.
- New authenticated notification APIs are documented in both frontend/backend endpoint references. Notification collection fields/indexes and the replica-set transaction requirement are documented in the database guides.
- Added an end-to-end API test using an isolated single-node MongoDB replica set for checkout attempts, failed/dismissed payment handling, the invariant that failed payments create no order and preserve the cart, successful Razorpay verification, store fulfillment updates, and customer notification read state. Razorpay provider calls are mocked; no live payment service or credentials are used.
- Added a store-authenticated CSV export endpoint for orders and transactions. It supports any validated date range, streams rows, limits output to the authenticated store, omits delivery addresses/customer contacts, and escapes spreadsheet formula cells. The dashboard can export either report for the selected day.
- Replaced Twilio Verify with Firebase Phone Authentication and Firebase Admin token verification. Firebase SMS/reCAPTCHA configuration is client-side; the API service-account private key remains backend-only. Updated OTP API docs, environment templates, and setup guidance.
- Added a dedicated store-dashboard Reports workspace with local date-range controls and separate orders/payment download cards. Customer checkout success and payment failures now appear in dismissible, right-sliding in-app toasts; dashboard entrance animations respect reduced-motion preferences.
- Added store metadata to the customer storefront selector: store phone numbers, Google Maps directions links, and an open/closed availability badge. The store card now exposes a "Get directions" action without leaving the checkout flow.
- Added a store-authenticated full-refund workflow for paid orders still in `placed` or `packing`. Clicking full refund immediately cancels the order and notifies the customer while the full refund is requested from Razorpay. The refund reservation and cancellation are transactional, so concurrent/repeated requests cannot issue duplicate refunds. Processed/failed webhook outcomes update the same cancellation notification; if a refund fails, the order remains cancelled and the customer is directed to contact the store.
- Exposed refund state in customer order details, store order actions, transaction history, and CSV exports. Refund webhooks are signed, correlated by an internal token passed in Razorpay notes, checked for the exact full amount, and deduplicated by Razorpay event ID. Provider timeouts remain explicitly pending for webhook/reconciliation rather than being retried automatically.
- Customer order details now show refund status, amount, provider reference, request time, and last status update, with clear guidance for pending, processed, and failed refunds. The customer order API only exposes these refund fields on the authenticated customer's own order.
- Newly received or updated order/refund notifications are polled while the customer session is active and displayed as independent dismissible right-side toasts with a direct link to the relevant order. Existing notifications remain available in the notification center and are not replayed as toasts on initial page load.
- Added a one-shot payment/refund reconciliation command (`backend`: `npm run reconcile-payments`). It checks aged checkout attempts, created payment transactions, and pending refunds against Razorpay; it applies only matching provider outcomes and never submits a new charge or refund. Schedule this command in the deployment environment and alert on failed runs.
- Added GitHub Actions CI for pull requests and pushes. It installs each app's lockfile dependencies, runs backend tests and frontend lint, and builds the production frontend.
- Added a store-only, paginated activity log for store order transitions, full-refund requests, product changes, stock changes, and open/close actions. Entries are committed atomically with the business action, contain no customer PII or raw request bodies, and expire after the selected one-year retention period. Production 500-level logs now omit raw error messages and stack traces.
- Added a click-to-call store support action on customer order details using the store's existing public phone number; the UI explains when a store has not configured one. No delivery ETA is displayed until delivery operations and timing are defined.
- Redesigned the store dashboard availability control with an animated status indicator, explanatory open/closed state, and a disabled/loading state during updates. The customer app refreshes public store availability every 15 seconds and locks browsing, basket, and checkout while its selected store is closed; the customer can switch to an open store or wait for the selected store to reopen.
- The customer store picker now disables closed stores. If switching to an open store with basket items, it explicitly asks permission to clear them and reports failures instead of silently discarding items. The checkout API independently rejects new or resumed checkout attempts for a closed store with `409 Conflict`; captured payments from an already-open checkout remain eligible for normal verification/webhook settlement.
- Added store order search for the short/full order ID, customer name, or phone, plus server-side newest/oldest and total-amount sorting. Order changes continue to use the existing server-validated fulfillment/refund actions. The live orders view polls every eight seconds; newly placed orders animate into view and highlight their item lines, while status/payment updates receive a separate brief highlight.
- Added animated dashboard-tab transitions, live-refresh indicators, and consistent loading states. The loading illustration is a locally authored Lottie animation of a cleaver slicing a cut of meat; it does not depend on a third-party animation URL and pauses when reduced motion is requested.

## Backend console logging

Run the backend in the foreground to see logs live:

```powershell
Set-Location .\backend
npm run dev
```

Each completed request emits one JSON line to stdout with:

- `timestamp`, `level`, and `event`
- `requestId` (also returned as `X-Request-Id`)
- HTTP method, URL path (not query string), status code, and elapsed milliseconds

HTTP failures with status `500` or above additionally emit an error record to stderr with the same request ID and error details. Startup failures and successful MongoDB connection/server-listening events are also logged. Request bodies and authorization/cookie headers are deliberately excluded; this avoids logging OTPs, passwords, access tokens, addresses, and payment payloads. Production hosts should collect the Node process stdout and stderr.

## Intentional current limitations

- Cash on delivery is visible but disabled; checkout currently implements UPI/Razorpay only.
- Store availability is backed by the persisted `isOpen` flag; closed stores are not selectable for shopping or new checkout.
- Product categories are limited to the five API enum values (`meat`, `vegetable`, `fruit`, `oil`, `rice`).
- Inventory/order/transaction tables use paginated list APIs; daily summary cards use aggregates and are not calculated from those page slices.

These are documented product/API boundaries rather than frontend/backend contract mismatches.

## Validation

Checks run from the individual package directories:

```powershell
Set-Location .\backend
npm test

Set-Location ..\frontend
npm run lint
npm run build
```

The API tests cover liveness/readiness responses, request logging/correlation IDs, validation, role enforcement, Firebase-token request shape, registration schema boundaries, and the required webhook event ID. Model tests cover all ten collections, notification schema/index behavior, and pricing/model behavior. The purchase integration test uses local MongoDB transactions with mocked Razorpay calls and checks both CSV exports, full-refund authorization/idempotency, blocked in-flight actions, closed-store checkout rejection, processed/failed refund webhooks, event deduplication, and customer notification. Live Firebase/Razorpay behavior remains unverified.
