# Fixes and rollout

7 November 2026. These changes address the six code findings in `application-analysis-report.md` and the failing OTP checks. They have not been deployed or applied to a production database by this task.

## Implemented

| Finding | Change |
| --- | --- |
| Checkout evidence expired after a day | Removed the checkout TTL. API startup and the reconciliation job remove the obsolete index from existing databases, preserving unrelated indexes. Unresolved checkout evidence is retained. |
| Refund submission interrupted after reservation | New reservations carry an explicit idempotent-dispatch marker. Both initial dispatch and recovery use the same stored request key and body with Razorpay's `X-Refund-Idempotency` header. Legacy requests are investigated rather than automatically resubmitted. |
| Reconciliation starvation | Stream all eligible records in bounded MongoDB cursor batches, rather than limiting each run to the first 100. Include failed attempts/transactions that can later receive captured payments. Paginate provider refund lookup. |
| Process-local throttles | Production authentication limits use atomic MongoDB counters shared across processes. Local development can opt in with `RATE_LIMIT_STORE=mongo`. Counter keys are hashed and expire through TTL cleanup. |
| Proxy configuration | Accept explicit trusted proxy IPs/CIDRs through `TRUSTED_PROXIES`; direct access remains the default. |
| Persistent, long-lived tokens | Access tokens expire after one hour, are held in tab sessionStorage, and carry unique session identifiers. Legacy localStorage credentials are removed. Logout revokes issued sessions in MongoDB. Password changes through Store.save revoke prior store sessions. Added an operator command to revoke all existing sessions for an account. |
| Failed optimistic writes | Basket clearing, stock, fulfillment status, and store-open changes now undo optimistic patches on failure. |
| OTP failures | Assert explicit provider success, remove raw provider-response logging, use supported Indian test numbers, isolate cooldown subjects, and assert cleanup of failed OTP challenges. |
| Build/maintenance | Removed obsolete commented authentication/SMS/model implementations. Use the expression-free light Lottie player. Start production with Node rather than nodemon. Add frontend regression tests to CI. |

Browser session storage remains readable by same-origin JavaScript; the session changes reduce persistence and token lifetime and add revocation, but do not make an XSS vulnerability harmless. A refresh flow is intentionally absent: customers and stores sign in again after session expiry.

## Host configuration and rollout

1. Configure `NODE_ENV=production`. Ensure the database user can list and drop the obsolete checkout TTL index and create indexes for revocations and rate-limit buckets. Startup fails if the migration cannot complete; do not bypass that failure. Already expired/deleted records cannot be recovered by this migration.
2. Configure `TRUSTED_PROXIES` using the actual proxy IPs/subnets supplied by the host. Avoid enabling blanket proxy trust. Test that requests through the proxy retain distinct client IPs and that clients cannot spoof them.
3. Schedule `npm run reconcile-payments` from the backend directory every 10–15 minutes using the host scheduler and the same database/provider environment. The repository does not contain hosting scheduler credentials or configuration, so the actual schedule was not installed. Avoid overlapping runs for efficiency; new refund submissions remain idempotent if overlap occurs.
4. Alert on non-zero reconciliation exit codes and `payment.reconciliation.failed`, `refund.reconciliation.failed`, `payment.reconciliation.pending`, and `refund.reconciliation.pending` events. Pending events identify records for age-based investigation; an abandoned checkout can legitimately remain unresolved. Set operational alert thresholds in the host's monitoring service.
5. Expect one fresh sign-in after rollout: persistent credentials from earlier versions are purged. Old bearer tokens without session identifiers are constrained to one hour of age while they age out; the new revocation mechanism applies to newly issued sessions. Online logout requests revoke the server session; offline logout clears the local credential but cannot guarantee server revocation until token expiry.
6. If the SMS API key previously included in `.env.example` was active, rotate it in the provider console and update the backend secret. The example now contains no SMS credential. This task did not access the provider account or change a live secret.

To revoke an account's existing sessions from a trusted backend terminal:

```text
npm run revoke-sessions -- store <account-id>
npm run revoke-sessions -- user <account-id>
```

Password updates should go through the Store model save path so revocation runs. If changing a password directly in MongoDB or through an update query, also run the revocation command.

## Refund recovery procedure

For newly reserved refunds, the scheduled job first looks for the provider refund. If none is found, it submits the same amount, notes, and idempotency key used by the original attempt. Provider timeouts leave the reservation pending for another safe retry. A pending provider refund is monitored until it reaches a terminal status.

Legacy pending refunds lack the new marker and may have been submitted without provider idempotency. If no matching provider record exists, the job emits an investigation error and does not send another refund. Inspect the payment/refund history and application transaction together in the provider dashboard. Confirm the final provider state before any manual refund; record the resolution in the transaction case notes. Do not simply set `refundIdempotent=true` on a legacy request or repeatedly submit a new key.

Keep checkout snapshots until financial resolution and the required support retention period are established. This change deliberately provides no automatic deletion policy for financial evidence.

## Validation

Final checks: backend **63 passed, 0 failed**; frontend **3 passed, 0 failed**; frontend ESLint and production build passed; `git diff --check` passed. The build no longer emits the Lottie direct-eval warning. Refund transport tests check the actual outgoing header and repeated request body without contacting Razorpay.

Regression coverage includes delayed captured payments for failed checkout attempts older than 24 hours, repeated settlement, more than 100 unresolved records, interrupted refund dispatch with key reuse, legacy refund protection, concurrent shared rate-limit increments, logout, one-hour token age, password-change revocation, and existing-index migration. Frontend checks exercise actual RTK Query basket failure handling and shared rollback behavior. See the final verification result in the chat and the latest `backend/application-analysis-tests.log`.

Live SMS delivery, live financial transactions, hosting proxy behavior, scheduled execution, full browser accessibility, mobile performance, and deployment behavior still require staging/host verification. Existing user edits in App.jsx, StorePicker.jsx, and useCustomerAppState.js were preserved.

Provider references: [Razorpay idempotent refund documentation](https://github.com/razorpay/markdown-docs/blob/master/api/refunds/normal-refunds-idempotent.md), [express-rate-limit store interface](https://github.com/express-rate-limit/express-rate-limit/blob/main/docs/guides/creating-a-store.mdx).
