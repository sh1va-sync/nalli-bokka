# Nalli Bokka application assessment

Follow-up: code fixes and regression coverage have been implemented. See [fixes and rollout](fixes-and-rollout.md) for the current behavior, remaining host configuration, and validation scope. The assessment below records the original findings.

Assessment date: 7 November 2026. Scope: current working tree, including existing local frontend edits. This is a source and automated-check assessment; it does not certify the deployed service or live payment integrations.

## Executive assessment

Nalli Bokka implements a substantial grocery commerce workflow across customer and store interfaces. Its strongest aspects are server-calculated pricing, role-scoped APIs, order snapshots, transactional payment settlement, signed payment notifications, and store audit records. The principal release risks are recovery after interrupted payments and refunds. Resolve the high-priority findings below before relying on unattended financial recovery.

No application source changes were made for this assessment. Existing edits to `frontend/src/App.jsx`, `StorePicker.jsx`, and `useCustomerAppState.js` were preserved.

## Product and architecture

| Area | Implementation observed |
| --- | --- |
| Customer experience | Store selection, searchable catalog and categories, weight/piece/pack purchases, guest basket, OTP login and registration, profile and addresses, checkout, delivery/pickup, orders, invoices, notifications, and reordering |
| Store operations | Password login, dashboard, inventory and category management, image uploads, order fulfillment, refunds, transactions and notes, exports, audit events, store availability, hours, and minimum order |
| Frontend | React 19, Vite 8, React Router 7, Redux Toolkit/RTK Query, Tailwind CSS, English/Telugu language provider, PWA manifest and service worker |
| Backend | Express 5 controllers/routes/middleware, Zod validation, Mongoose/MongoDB |
| Integrations | Razorpay payments/refunds, Renflair OTP SMS, Cloudinary product/category images, PDFKit invoice generation |
| Operations | Structured request logs, liveness/readiness routes, CI lint/build/test jobs, store provisioning and payment reconciliation scripts |

The main purchase path snapshots server-priced cart items into a checkout attempt, creates a provider payment order, and creates the application order after confirmed payment. Order, transaction, notification, and cart updates share a MongoDB transaction. This requires a MongoDB deployment supporting transactions, such as a replica set.

## Findings, in priority order

### 1. High: checkout evidence expires even while payment is unresolved

Evidence: `backend/src/models/CheckoutAttempt.js:123` defines a 24-hour TTL on `createdAt`, without a status filter. `handleRazorpayCheckoutCallback` and the checkout webhook branch in `backend/src/controllers/paymentController.js` require this record when no application transaction exists.

Scenario: a payment is captured, but callback/webhook processing and reconciliation remain unavailable for more than a day. MongoDB can delete the attempt, including its item and address snapshots. A later notification cannot reconstruct the paid order and returns a missing-record error. The same TTL also removes failed attempts that might later receive a valid captured-payment notification.

Recommendation: retain unresolved financial records until provider state is conclusively reconciled. Apply retention only to explicitly eligible terminal records, with a retention period chosen for support and investigation needs. Verify delayed settlement after the original 24-hour boundary.

### 2. High: interrupted refund submission can leave a permanent pending state

Evidence: `refundStoreOrder` in `backend/src/controllers/paymentController.js:119–225` commits cancellation and a pending refund reservation before calling the provider. An existing reservation returns its current state without submitting the refund again. `backend/scripts/reconcilePaymentState.js:80–92` only looks for an existing provider refund; when none exists, it returns pending.

Scenario: the process stops after the reservation commits but before the provider request starts. The order is cancelled, the customer has not been refunded, subsequent requests return pending, and reconciliation cannot advance it. A provider rejection before creation has a similar unresolved outcome.

Recommendation: use a durable refund work queue/outbox and distinguish reserved, submitted, unknown, and terminal states. Establish provider state before retrying an ambiguous submission; use supported provider idempotency if available. Add an operator workflow and alert for aged reservations. Do not blindly retry requests that may already have succeeded.

### 3. High: reconciliation can repeatedly select the same unresolved records

Evidence: `backend/scripts/reconcilePaymentState.js:120–134` selects the oldest 100 records in each category. Records that remain pending keep their selection age; there is no cursor or next-check scheduling. Checkout selection also excludes attempts marked failed, including those marked by the customer failure endpoint.

Scenario: 100 abandoned pending attempts monopolize each run until removed; newer captured payments needing recovery are never scanned during that interval. Pending transactions and refunds have the same batch-selection problem. A client-marked failed attempt also depends on callback/webhook recovery rather than this job if a payment subsequently succeeds.

Recommendation: paginate the eligible set or schedule checks using `nextReconcileAt`/`lastCheckedAt` with fair ordering. Include financially unresolved failed attempts where later provider success is possible. Test more than 100 persistent pending records followed by a captured payment.

### 4. Medium: authentication throttles are process-local and proxy behavior is unspecified

Evidence: `backend/src/routes/authRoutes.js` uses rate-limit middleware without a configured shared store. `backend/src/app.js` does not configure Express proxy trust.

Impact: limits reset on process restart and apply independently across replicas. Behind a reverse proxy, IP limits may group customers under the proxy address unless the deployment forwards client identity through a correctly configured trust boundary. Phone-based limits provide useful additional protection, but also remain process-local.

Recommendation: use a shared limiter store for replicated deployments and configure proxy trust to the actual hosting topology. Test legitimate users behind the proxy and attempted forwarded-header spoofing. Hosting topology was not inspected, so the proxy impact is deployment-dependent.

### 5. Medium: long-lived bearer tokens persist in browser storage

Evidence: `frontend/src/app/store.js` persists customer and store tokens in localStorage; `backend/src/controllers/authController.js` defaults token validity to seven days. `authenticate.js` checks signature, issuer, and role but has no session revocation lookup.

Impact: injected same-origin JavaScript could read persisted tokens, and a stolen token can remain usable until expiry. This is a defense-in-depth concern; this assessment did not demonstrate an XSS exploit.

Recommendation: assess secure HttpOnly cookie sessions, or use short-lived access tokens with a controlled refresh and revocation mechanism. Define store logout/password-change revocation behavior. Account for CSRF protection if adopting cookie authentication.

### 6. Medium: some optimistic updates have no explicit failure rollback

Evidence: `clearCart` in `frontend/src/features/api/api.js:275–285` immediately empties cached cart data without awaiting `queryFulfilled` or undoing the patch. Several store mutations use the same immediate-update style. Other mutations in this file already implement rollback correctly.

Impact: failed writes can temporarily present an empty basket or changed operational state even though the server rejected the action. Tag invalidation and refetch may restore the data, but recovery depends on a successful subsequent fetch.

Recommendation: retain each patch and undo it on rejection, while showing a clear error. Verify behavior during offline operation and 4xx/5xx responses.

## Strengths to preserve

- Backend prices are recalculated from current product configuration; clients cannot provide trusted totals. Weight, piece, and pack rules are centralized in `utils/pricing.js`.
- Checkout/order snapshots preserve purchase details independently of later product edits.
- Authentication uses explicit JWT algorithms and issuer checks; OTP codes are HMAC-hashed, expire, have bounded attempts, and are atomically consumed.
- Store APIs require a store role, and inspected order/refund queries include ownership constraints.
- Payment code checks expected order, amount, and currency; webhook processing uses signatures and event records for replay handling.
- Request validation, body/upload limits, security headers, restricted CORS origins, structured errors, and logs that omit request bodies and query values provide useful safeguards.
- CI and backend integration tests provide an existing foundation for regression checks.

## Validation and limits

Frontend ESLint completed successfully. The production build completed successfully with 2,007 modules transformed. Vite emitted a direct-eval warning from the `lottie-web` dependency. The main JS output was about 497 kB uncompressed / 145 kB gzip, with a separate approximately 218 kB / 65 kB gzip chunk. Measure actual route loading on a budget mobile device before assigning a performance rating.

The first backend test run encountered sandbox-local HTTP connection failures. The completed second run with approved access reported **55 tests: 53 passed, 2 failed**, with no skips. Both failures were OTP tests in `backend/test/api.test.js`: the successful-send test received HTTP 400 instead of 200 (line 261), and the provider-rejection test received 429 instead of 502 (line 306). These are unresolved test failures; investigate provider stubbing/request handling and limiter isolation before accepting the authentication checks as green. This assessment does not establish their root cause. Full evidence is in `backend/application-analysis-tests.log`.

This review did not perform browser visual/accessibility testing, load testing, a dependency vulnerability audit, deployed infrastructure inspection, or live SMS/payment/refund transactions. Frontend package scripts provide lint and build, but no automated frontend behavior test command. Production secrets and customer data were not used for this assessment.

## Recommended delivery sequence

1. Correct checkout retention, refund dispatch recovery, and reconciliation fairness; add focused regression tests for their failure scenarios.
2. Establish shared rate limits, deployment-specific proxy configuration, aged-payment/refund alerts, and a documented operator recovery procedure.
3. Add browser coverage for login, cart migration, payment redirect/resume, failed mutations, store fulfillment, and session expiry.
4. Validate mobile layout, keyboard/focus behavior, screen-reader labels, Telugu text, service-worker updates, and slow-network behavior.
5. Measure route performance, review animation dependency cost and CSP compatibility, and remove obsolete commented implementations from authentication/SMS files.

Release recommendation: complete the financial-recovery corrections and validate them in staging before treating the application as ready for unattended production operation. The existing feature set and safeguards are a useful base, but passing current tests alone would not resolve these failure windows.
