# Developer Overview: Frontend/Backend Consistency Audit

## Audit scope

This review traced the customer and store-dashboard frontend flows against the Express routes, validation schemas, controllers, Mongoose models, API references, and the existing automated tests. Findings below are verified integration or operational inconsistencies that were corrected. The scope was the implemented stage-one storefront and store portal; intentionally unavailable features are called out separately.

## Findings and resolutions

| # | Area | Inconsistency | Resolution |
| --- | --- | --- | --- |
| 1 | Customer registration | OTP verification returns `{ isNewUser: true, verificationToken }` for a new phone, but the frontend treated every successful verification as `{ token, user }`. New customers could not finish signing in. | Added the `/auth/users/register` RTK Query mutation and a registration step that submits the short-lived token, required name, and optional email. Existing-user OTP sign-in remains unchanged. |
| 2 | Checkout retries | The order controller checked for a nonempty cart before looking up an idempotency key. After a successful checkout emptied the cart, a retry with the same key incorrectly returned `400` instead of the completed order. | Completed keys are now checked before cart validation. An in-progress key and a key whose order was deleted receive explicit `409` errors. |
| 3 | Razorpay webhook deduplication | Webhook records used `payment.id` as the event deduplication key. A later event type for the same payment could be acknowledged as a duplicate and never update payment state. | Handled events now require and deduplicate on Razorpay's `x-razorpay-event-id`; payment IDs remain transaction data. Webhook persistence/settlement failures now flow through the central error handler. |
| 4 | Store daily metrics and lists | The dashboard counted local-day orders and transactions from only page 1 (100 rows), so “today” totals and table contents could be incomplete. Inventory, orders, and transactions also had no controls to move beyond their first API page. | The dashboard query accepts a paired `from`/`to` interval and MongoDB aggregates exact counts/revenue over those boundaries. List endpoints now accept bounded time filters where needed, and inventory, today's orders, and today's transactions have next/previous pagination controls. The dashboard's shared date picker now lets stores view a chosen local day across metrics, orders, and transactions. |
| 5 | API documentation drift | API references described name/email in the OTP verification request, omitted the implemented registration endpoint, and documented the previous idempotency and webhook defects as current behavior. | Updated the backend and frontend API references, backend implementation guide, database design guides, and app READMEs to match the live contract and corrected behavior. |
| 6 | Backend observability | Requests had no consistent completion logs or correlation ID; only selected server errors were printed, making normal API activity difficult to trace in a live console. | Added structured JSON console logs for each completed HTTP request, a response `X-Request-Id`, structured 5xx/startup/database events, and request IDs on centralized error logs. Sensitive bodies, headers, and query values are not logged. |
| 7 | Model inventory test | A test claimed only six Mongoose models existed even though checkout and webhook processing also use `IdempotencyKey` and `WebhookEvent`. | The model test was updated to check the model collections; the current suite also covers the added `Notification` collection. |

## Follow-up improvements implemented

- Added `GET /health/ready` as a database-aware readiness probe, distinct from the existing HTTP liveness endpoint.
- Added an in-app customer notification center. Store fulfillment status changes and notification creation are committed together; customers can list notifications, see an unread count, and mark one or all as read. The frontend shows a badge and notification page. No external messaging provider is used.
- New authenticated notification APIs are documented in both frontend/backend endpoint references. Notification collection fields/indexes and the replica-set transaction requirement are documented in the database guides.
- Added an end-to-end API test using an isolated single-node MongoDB replica set for cart checkout, idempotent retry, Razorpay-order creation/verification, store fulfillment updates, and customer notification read state. Razorpay provider calls are mocked; no live payment service or credentials are used.
- Added a store-authenticated CSV export endpoint for orders and transactions. It supports any validated date range, streams rows, limits output to the authenticated store, omits delivery addresses/customer contacts, and escapes spreadsheet formula cells. The dashboard can export either report for the selected day.
- Added a store-authenticated full-refund workflow for paid orders still in `placed` or `packing`. It reserves each refund transactionally before calling Razorpay so concurrent and repeated requests cannot issue duplicate refunds. `refund.processed` cancels the order and atomically notifies the customer; `refund.failed` leaves the payment recorded and permits fulfillment to continue. While a refund is pending, fulfillment, customer cancellation, and payment retries are blocked.
- Exposed refund state in customer order details, store order actions, transaction history, and CSV exports. Refund webhooks are signed, correlated by an internal token passed in Razorpay notes, checked for the exact full amount, and deduplicated by Razorpay event ID. Provider timeouts remain explicitly pending for webhook/reconciliation rather than being retried automatically.

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
- The store open/close control is disabled because there is no corresponding backend state or endpoint.
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

The API tests cover liveness/readiness responses, request logging/correlation IDs, validation, role enforcement, registration schema boundaries, and the required webhook event ID. Model tests cover all nine collections, notification schema/index behavior, and pricing/model behavior. The purchase integration test uses local MongoDB transactions with mocked Razorpay calls and checks both CSV exports, full-refund authorization/idempotency, blocked in-flight actions, processed/failed refund webhooks, event deduplication, and customer notification. Live Twilio/Razorpay behavior remains unverified.
