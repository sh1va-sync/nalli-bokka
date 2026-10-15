# Nalli Bokka API and Server Documentation

This document is the implementation reference for frontend developers integrating with the Nalli Bokka Express API. It describes the routes, request and response shapes, authentication, validation, data models, pricing rules, server configuration, and known integration constraints.

## 1. API at a glance

- **Base URL (local):** `http://localhost:3000/api`
- **Content type:** JSON (`application/json`) except the Razorpay webhook, which must send its signed raw JSON body.
- **Authentication:** JWT bearer token for customer and store-admin protected routes.
- **Database:** MongoDB through Mongoose.
- **Money:** API product and order prices are in rupees as JSON numbers. Razorpay amounts are in paise (1 rupee = 100 paise).
- **IDs:** MongoDB ObjectIds are returned as 24-character hexadecimal strings.
- **Dates:** Mongoose timestamps are JSON ISO-8601 date strings.

Endpoints in this document are relative to the base URL unless marked otherwise.

## 2. Local setup and server configuration

### Requirements and commands

- Node.js 18 or newer
- npm
- MongoDB
- Firebase Phone Authentication and Firebase Admin service-account credentials for OTP
- Razorpay credentials for online payment

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The server connects to MongoDB before it listens. `npm start` starts without watch mode, `npm run dev` runs with Node's watch mode, `npm test` runs the automated tests, and `npm run create-store` provisions a store/admin account from an interactive terminal.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | HTTP port; defaults to `3000`. |
| `MONGODB_URI` | Yes | MongoDB connection string. The server and store-creation script fail if it is missing. |
| `JWT_SECRET` | Yes | Secret used to sign and verify JWTs. Must be at least 32 characters; startup fails otherwise. Use a unique, high-entropy secret. |
| `JWT_EXPIRES_IN` | No | JWT lifetime accepted by `jsonwebtoken`, for example `7d`; defaults to `7d`. |
| `CORS_ORIGIN` | No | Comma-separated allow-list of website origins. Defaults to `http://localhost:5173`. Requests without an `Origin` header are allowed. |
| `FIREBASE_PROJECT_ID` | For OTP | Firebase project ID used to verify ID tokens. |
| `FIREBASE_CLIENT_EMAIL` | For OTP | Service-account email from Firebase service-account credentials. |
| `FIREBASE_PRIVATE_KEY` | For OTP | Service-account private key; keep it secret and encode newlines as `\n` in `.env`. |
| `RAZORPAY_KEY_ID` | For payments | Razorpay key ID; returned to the frontend when creating a payment order. |
| `RAZORPAY_KEY_SECRET` | For payments | Razorpay secret used for API access and client-payment signature verification. Never expose it to the frontend. |
| `RAZORPAY_WEBHOOK_SECRET` | For webhooks | Secret configured for the Razorpay webhook endpoint. Never expose it to the frontend. |

The server applies Helmet security headers, CORS, a 1 MB JSON body limit, a JSON 404 handler, and centralized error formatting. The Razorpay webhook route is mounted before the JSON parser so it can verify the original raw request bytes.

### Console logging

Run `npm run dev` or `npm start` in the foreground to see live logs. Each completed request writes a structured JSON record to stdout with its timestamp, generated request ID, method, path (without query values), status, and duration. The same ID is returned in the `X-Request-Id` response header and included in centralized server-error logs. Successful database connection, server listening, and startup failures are also logged. Request bodies and authorization/cookie headers are never logged. In production, server-error logs omit raw error messages and stack traces; development retains these details for debugging. Capture the Node process stdout and stderr for production collection.

### MongoDB deployment requirement

Order checkout, payment settlement, and store order-status/notification updates start MongoDB sessions and transactions. MongoDB multi-document transactions require a replica set or sharded cluster; a standalone MongoDB server cannot support these operations. Configure a replica set (including a single-node replica set for local development) before exercising checkout, payment, or store fulfillment flows.

## 3. Authentication and standard request behavior

### Customer authentication (OTP)

1. The browser sends the customer's E.164 phone number to Firebase Phone Authentication, protected by Firebase's reCAPTCHA verifier.
2. The customer enters the received code; Firebase returns a signed ID token.
3. Submit that token to `POST /auth/users/verify`; Firebase Admin verifies its signature and phone sign-in provider.
4. Existing customers receive a JWT and profile. First-time customers receive a short-lived registration token.
5. First-time customers submit that token, a required name, and optional email to `POST /auth/users/register`; the response contains their JWT and profile.
6. Send the customer JWT as `Authorization: Bearer <token>` for customer routes.

Firebase applies phone-SMS quotas and abuse protection. API token verification and registration share a rate limit of 5 requests per 10 minutes per client IP. Store login is limited to 10 attempts per 15 minutes per client IP. Rate-limit responses have an `error` string.

### Store-admin authentication

Store accounts are provisioned from the trusted server terminal; there is no public store registration endpoint. The password is hashed with bcrypt when stored and is not returned in API responses. Store admins sign in at `POST /auth/stores/login`, then use the returned JWT with store routes.

### Tokens and authorization

- Tokens are signed with HS256, identify the account in `sub`, contain role `user` or `store`, and use issuer `nalli-bokka-api`.
- Token expiry uses `JWT_EXPIRES_IN` or defaults to seven days.
- Customer routes require role `user`; store dashboard/operations routes require role `store`.
- `GET /auth/me` accepts either role.
- Missing/invalid/expired credentials return `401`; a valid token with the wrong role returns `403`.
- This API does not currently expose refresh tokens or token revocation.

### Validation, pagination, and errors

Request bodies and query strings are validated with strict schemas. Unknown fields are rejected rather than silently accepted. JSON request bodies should use `Content-Type: application/json`.

List endpoints accept:

| Parameter | Default | Constraints |
| --- | --- | --- |
| `page` | `1` | Integer, at least 1. |
| `limit` | `20` | Integer, 1–100. |

Paged responses use `{ "data": [...], "pagination": { "page": 1, "limit": 20, "total": 0, "pages": 0 } }`. When there are no results, `pages` is `0`.

Standard application errors use `{ "error": "message" }`. Validation errors are `400`; missing resources are usually `404`; state conflicts, unavailable stock, or duplicate unique values are `409`; authentication failures are `401`; role failures are `403`; configured external services that are unavailable return `503`. Unhandled server errors return `500` with a generic message and are logged by the server. Malformed JSON returns `400`; bodies over 1 MB return `413`.

## 4. Endpoint reference

### 4.1 Health and authentication

#### `GET /health`

Public liveness check. Does not query MongoDB.

```json
{ "status": "ok" }
```

#### `GET /health/ready`

Public readiness check for deployment probes. Returns `200` only when the MongoDB connection is ready; otherwise returns `503`.

```json
{ "status": "ready" }
```

```json
{ "status": "not_ready" }
```

#### `POST /auth/users/verify`

Public. Verifies a Firebase ID token produced by Firebase Phone Authentication after the customer enters the SMS code. Firebase handles SMS delivery and reCAPTCHA in the browser; the API verifies the token with Firebase Admin.

Request: `{ "firebaseIdToken": "<firebase-id-token>" }`. The token's verified `phone_number` claim supplies the account phone, and its sign-in provider must be `phone`.

Existing customers receive `{ "isNewUser": false, "token": "<jwt>", "user": <user> }` with status `200`. First-time customers receive `{ "isNewUser": true, "verificationToken": "<short-lived-registration-jwt>" }` with status `200`; this token expires after 10 minutes and is not an authenticated customer token.

Possible errors: `400` invalid request; `401` invalid/expired Firebase ID token or non-phone sign-in; `429` rate limit exceeded; `503` Firebase Admin or JWT configuration unavailable.

#### `POST /auth/users/register`

Public. Completes registration using a valid `verificationToken`, required `name` (1–100 characters), and optional valid `email` (maximum 254 characters).

Success (`201`): `{ "isNewUser": true, "token": "<customer-jwt>", "user": <created user> }`.

Possible errors: `400` invalid request; `401` invalid/expired registration token; `409` account already exists for the phone or email is already used.

#### `POST /auth/stores/login`

Public. Logs in a provisioned store admin.

Request:

```json
{ "username": "shop", "password": "<store-password>" }
```

Success (`200`):

```json
{
  "token": "<jwt>",
  "store": {
    "id": "<storeId>",
    "storeName": "Nalli Bokka",
    "username": "shop",
    "location": "Hyderabad"
  }
}
```

Possible errors: `400` invalid body; `401` invalid credentials; `429` rate limit exceeded; `503` JWT configuration unavailable.

#### `GET /auth/me`

Customer or store token required.

Success (`200`):

```json
{ "account": { "...": "current user or store document" }, "role": "user" }
```

The account is loaded from the database for the role and ID in the token. Store password is excluded.

### 4.2 Customer profile and saved addresses

All routes below require a customer token.

#### `GET /users/me`

Returns `{ "data": <user> }`, including `name`, `phone`, optional `email`, `addresses`, `_id`, `createdAt`, and `updatedAt`.

#### `PATCH /users/me`

Updates profile fields. At least one supported field is required; extra fields are rejected.

Request:

```json
{ "name": "Asha Rao", "email": "asha@example.com" }
```

- `name`: optional, 1–100 characters.
- `email`: optional valid email or empty string. Empty string clears the email.

Success: `200 { "data": <updated user> }`. Duplicate email returns `409`.

#### `POST /users/me/addresses`

Adds an address to the authenticated user's embedded address list.

Request:

```json
{
  "label": "Home",
  "fullAddress": "12 Example Road, Hyderabad",
  "landmark": "Near the park",
  "pincode": "500001"
}
```

- `label`: required, 1–40 characters.
- `fullAddress`: required, 5–500 characters.
- `landmark`: optional, up to 200 characters; defaults to empty string.
- `pincode`: required, exactly six digits and represented as a string.

Success: `201 { "data": <new address including its generated _id> }`.

#### `PATCH /users/me/addresses/:addressId`

Updates one address owned by the current user. Path ID must be a valid ObjectId. Supply at least one field from the address shape above; each supplied field follows the same validation constraints as address creation.

Success: `200 { "data": <updated address> }`. Returns `404` if the address is not found or does not belong to this user.

#### `DELETE /users/me/addresses/:addressId`

Deletes an address owned by the current user.

Success: `204 No Content`. Returns `404` if not found.

### 4.3 Public store and product catalog

#### `GET /stores`

Public, paginated. Optional `search` (up to 100 characters) matches store name case-insensitively.

Success:

```json
{
  "data": [
    { "_id": "<storeId>", "storeName": "Nalli Bokka", "location": "Hyderabad" }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

Only `storeName` and `location` are selected; passwords are never part of this public response.

#### `GET /stores/:id`

Public store detail. Returns `200 { "data": { "_id": "...", "storeName": "...", "location": "..." } }`. Invalid ObjectId returns `400`; unknown store returns `404`.

#### `GET /products`

Public, paginated, returns only products currently marked in stock. Optional filters:

| Query | Meaning |
| --- | --- |
| `storeId` | Filter by store ObjectId. |
| `productType` | A built-in or store-created category name. |
| `search` | Case-insensitive product-name substring, up to 100 characters. |
| `page`, `limit` | Standard pagination. |

Each product's `storeId` is populated with the store's `storeName` and `location`.

#### `GET /products/categories`

Public list of built-in categories and store-created category names.

#### `GET /products/:id`

Public. Returns one in-stock product as `{ "data": <product with populated storeId> }`. Invalid ObjectId returns `400`; missing or out-of-stock products return `404`.

### 4.4 Cart

All cart routes require a customer token. There is one cart per user. Cart totals are not persisted; the server recalculates prices from current product data each time it returns the cart.

Selections share this shape:

```json
{
  "selectionType": "weight",
  "selectedQuantity": 0.5
}
```

- `selectionType`: `weight`, `pieces`, or `pack`.
- `selectedQuantity`: positive number. For pieces and packs it must be an integer.
- `selectedPackLabel`: required only for `pack` and must exactly match one of the product's pack labels.
- Weight quantity is in kilograms: `0.25` = 250 g; `0.5` = 500 g.

#### `GET /cart`

Returns `{ "data": { "items": [...], "total": 0, "hasUnavailableItems": false } }`. If no cart exists, the empty-cart response is used.

Available item fields include `itemId`, `productId`, `productName`, `imageUrl`, selection fields, `available`, `unitPrice`, and `lineTotal`. If a product was deleted or the stored selection is no longer sellable, the item has `available: false` and an `issue` string. When any item is unavailable, `total` is `null` and `hasUnavailableItems` is `true`; the frontend should prompt the user to remove or correct unavailable items before checkout.

#### `POST /cart/items`

Adds a product selection. The server validates current stock and product pricing. An identical product + selection type + pack label combines with the existing cart quantity.

Request for weight or pieces:

```json
{
  "productId": "<productId>",
  "selectionType": "weight",
  "selectedQuantity": 0.5
}
```

Request for a pack:

```json
{
  "productId": "<productId>",
  "selectionType": "pack",
  "selectedQuantity": 2,
  "selectedPackLabel": "5 L"
}
```

Success: `201 { "data": <recalculated cart response> }`. Possible errors include `400` invalid/incompatible selection, `404` unknown product, and `409` out of stock.

#### `PATCH /cart/items/:itemId`

Replaces the selected quantity/type for one existing cart line. The body uses the shared selection shape above (no productId; product is determined from the cart line).

Success: `200 { "data": <recalculated cart response> }`. Possible errors: `400` invalid/incompatible selection; `404` cart item or product not found; `409` out of stock.

#### `DELETE /cart/items/:itemId`

Removes one cart line.

Success: `200 { "data": <recalculated cart response> }`. Returns `404` if the cart line does not exist.

### 4.5 Orders and checkout

All customer order routes require a customer token. Each order belongs to exactly one store. If the cart contains products from multiple stores, `storeId` is required to check out that store's items; the other stores' cart items remain in the cart.

#### `POST /orders`

This route is not available for new checkouts. An order is created only after Razorpay confirms a captured payment through `POST /payments/razorpay/verify`. A failed or dismissed payment creates no order and leaves the cart unchanged. Start a purchase using `POST /payments/razorpay/order` in the Payments section.

#### `GET /orders`

Lists only the authenticated user's orders, newest first. Accepts `page`, `limit`, optional `orderStatus` (`placed`, `packing`, `out for delivery`, `delivered`, `cancelled`), and optional paired ISO-8601 `from`/`to` bounds on `createdAt` (`[from, to)`).

Response: paginated envelope. `storeId` is populated with `storeName` and `location`.

#### `GET /orders/:orderId`

Returns one order owned by the current user, with populated store details:

```json
{
  "data": {
    "...": "order",
    "storeId": { "_id": "...", "storeName": "...", "location": "..." },
    "refund": {
      "status": "processed",
      "amount": 400,
      "reference": "rfnd_example",
      "requestedAt": "<ISO-8601>",
      "updatedAt": "<ISO-8601>"
    }
  }
}
```

The `refund` field is `null` when no refund has been requested. Otherwise it includes the current provider status, amount in rupees, provider reference when available, request time, and last status update time.

Returns `404` when the order is missing or belongs to another user.

#### `GET /orders/:orderId/invoice`

Downloads a PDF invoice for an order owned by the authenticated customer. The invoice uses the saved order item, price, customer, store, and delivery-address details, is stored with the order when first generated, and is returned as a private attachment on each download.

Returns `404` when the order is missing or belongs to another user.

#### `POST /orders/:orderId/cancel`

Cancels the authenticated user's order only if the lifecycle allows cancellation (placed or packing), the order is not paid, and there is no active created payment transaction.

Success: `200 { "data": <updated order> }`. Returns `404` for an inaccessible order and `409` if its status/payment state prevents cancellation.

#### `PATCH /store/orders/:orderId/status`

Store-admin operation documented in the store section. Order transitions are constrained; see section 6.

### 4.6 Payments

Payment routes integrate Razorpay. Never put `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` in browser code. The `keyId` returned by the create-payment endpoint is the frontend-facing Razorpay key.

#### `POST /payments/razorpay/order`

Customer token required. Validates the saved address, selected store, cart availability and current prices, then persists a short-lived `CheckoutAttempt` and creates a Razorpay payment order. It does not create an `Order` or modify the cart.

Request body:

```json
{
  "addressId": "<savedAddressId>",
  "storeId": "<storeId>",
  "idempotencyKey": "<uuid>"
}
```

`storeId` may be omitted only for a single-store cart. The UUID idempotency key is customer-scoped. Reuse it for retries of the same request and create a new key for a new attempt.

Success (`201`, or `200` for an active idempotent retry):

```json
{
  "data": {
    "razorpayOrderId": "<razorpayOrderId>",
    "keyId": "<RAZORPAY_KEY_ID>",
    "amount": 40000,
    "currency": "INR"
  }
}
```

`amount` is paise. The cart and orders collection remain unchanged until payment is verified. Errors include `400` invalid/empty checkout, `404` missing user/address, `409` invalid or unavailable cart products or conflicting store selection, and `503` missing Razorpay configuration.

#### `POST /payments/razorpay/:razorpayOrderId/failed`

Customer token required. Marks the customer's checkout attempt failed after Razorpay reports failure or the checkout window is dismissed. No request body is required. Success: `200 { "data": { "status": "failed", "orderCreated": false } }`. This never creates an order or clears the cart. Returns `404` for an unknown/non-owned attempt and `409` if payment is already confirmed.

#### `POST /orders/:orderId/payment`

Customer token required. Legacy payment retry for an already-persisted unpaid order. New checkouts must use `POST /payments/razorpay/order`.

Success (`201`):

```json
{
  "data": {
    "transactionId": "<transactionId>",
    "razorpayOrderId": "<razorpayOrderId>",
    "keyId": "<RAZORPAY_KEY_ID>",
    "amount": 12345,
    "currency": "INR"
  }
}
```

`amount` is paise for the Razorpay Checkout SDK. The server amount is derived from the persisted order total. Do not calculate or submit a replacement amount from the frontend.

Possible errors: `400` non-positive order total; `404` order not found or not owned by the current user; `409` order cancelled/already paid; `503` Razorpay is not configured.

Frontend flow:

This endpoint supports older persisted unpaid orders only. For new purchases, use `POST /payments/razorpay/order`, open Razorpay Checkout, mark failed/dismissed attempts with the failed endpoint, and submit successful callbacks to `POST /payments/razorpay/verify`. Verification atomically creates the paid order, transaction, and placed notification and removes only the purchased cart lines.

#### `POST /payments/razorpay/verify`

Customer token required. Verifies the checkout signature server-side, fetches the payment from Razorpay, checks its order ID, amount, currency and captured state, then updates the transaction/order.

Request:

```json
{
  "razorpayOrderId": "order_...",
  "paymentId": "pay_...",
  "signature": "<64-character-hex-signature>"
}
```

Success:

```json
{ "data": { "orderId": "<orderId>", "paymentStatus": "paid" } }
```

Possible errors: `400` malformed signature or invalid signature; `404` unknown payment transaction/order; `409` payment is not captured or its order/amount/currency does not match; `503` Razorpay is not configured. The MongoDB state update uses a transaction and therefore requires transaction-capable MongoDB.

#### `POST /api/payments/razorpay/webhook`

External Razorpay endpoint; no JWT. Configure this exact full URL in the Razorpay dashboard:

`https://<your-api-host>/api/payments/razorpay/webhook`

The endpoint accepts signed `application/json` raw request bytes and validates the `x-razorpay-signature` header using `RAZORPAY_WEBHOOK_SECRET`. It processes `payment.captured` and `payment.failed`; other event types receive `{ "received": true }` without payment processing. For supported events, payment order ID, payment ID, amount, and currency must match a known transaction. Successful handling returns `200 { "received": true }`.

Handled webhook events require Razorpay's `x-razorpay-event-id` header and are deduplicated by that event ID rather than the payment ID. This allows distinct events concerning one payment to be processed independently. The endpoint responds `404` for a payment order ID that has no local checkout attempt or transaction. Frontend code should use the client verification endpoint for customer confirmation and refresh the order state; webhook delivery is asynchronous and is not a browser callback.

### 4.7 Store dashboard and operations

Every endpoint in this section requires a store-admin token. Queries and mutations are always scoped to the authenticated store; a frontend must not supply another store's ID to operate on its data.

#### `GET /store/dashboard`

Optional query `days` (integer 1–90, default 7) defines the paid-revenue lookback period. Optional `from` and `to` ISO-8601 timestamps must be supplied together; they provide exact interval aggregates (inclusive `from`, exclusive `to`) for daily order and transaction metrics.

Response:

```json
{
  "data": {
    "inventory": { "inStock": 12, "outOfStock": 2 },
    "ordersByStatus": { "placed": 3, "packing": 1 },
    "paidRevenue": { "sinceDays": 7, "amount": 4200, "orders": 6 },
    "periodMetrics": {
      "from": "2026-10-09T18:30:00.000Z",
      "to": "2026-10-10T18:30:00.000Z",
      "orders": 4,
      "paidRevenue": 2600,
      "paidTransactions": 3,
      "transactions": { "created": 1, "paid": 3, "failed": 0 }
    },
    "recentOrders": []
  }
}
```

Counts are for this store. `paidRevenue` sums `totalAmount` on paid orders whose `createdAt` falls within the selected rolling period. When a date interval is supplied, `periodMetrics` counts orders by `createdAt` and transactions by `timestamp` within that exact interval. `recentOrders` contains up to 10 newest orders and includes the customer's `name` and `phone`.

#### `GET /store/products`

Paged list of all this store's products, including out-of-stock products. Optional `productType`, `search`, `inStock`, and `pricingMode` filters. Response is a paginated envelope.

#### `GET /store/product-categories`

Lists built-in categories and categories created by this store.

#### `POST /store/product-categories`

Creates a lowercase, store-specific category with a `{ "name": "dry fruits" }` request body. Duplicate or built-in names return `409`.

#### `POST /store/products`

Creates a product for the authenticated store. The client must not send `storeId`; it is set from the token.

Common fields:

```json
{
  "productType": "meat",
  "productName": "Mutton",
  "imageUrl": "https://cdn.example.com/mutton.jpg",
  "inStock": true,
  "pricePerKg": 800,
  "pieceWeightGrams": 250
}
```

Fields and constraints:

- `productType`: required category name, 1–40 characters; custom categories must first be created by this store.
- `pricingMode`: required for new products: `weight` or `pack`.
- `productName`: required, 1–120 characters.
- `imageUrl`: required, valid HTTP or HTTPS URL, maximum 2048 characters.
- `inStock`: optional boolean; defaults to true.
- `pricePerKg`: optional nonnegative rupee amount (required for meat/vegetable/fruit; also used for loose rice).
- `pieceWeightGrams`: optional positive number; enables piece-based pricing on meat/vegetable/fruit.
- `packs`: optional array of up to 50 `{ "label": "...", "price": 0 }` objects. Pack label is 1–40 characters; price is a nonnegative rupee amount. Labels must be unique within a product.

Any category can use `weight` pricing, which requires `pricePerKg` and no packs, or `pack` pricing, which requires at least one pack and no `pricePerKg`. Legacy products without `pricingMode` continue to use their previous category-based behavior.

Success: `201 { "data": <created product> }`. Invalid pricing combinations are rejected as `400`.

#### `PATCH /store/products/:productId`

Updates one product owned by this store. Body must include at least one editable field; accepted fields and validation follow product creation, except `pricePerKg` and `pieceWeightGrams` may be set to `null` to clear them. Product schema constraints are rechecked after the update. Returns `200 { "data": <updated product> }`, or `404` if product is not owned by this store.

#### `PATCH /store/products/:productId/stock`

Quick stock toggle:

```json
{ "inStock": false }
```

Success: `200 { "data": <updated product> }`. Returns `404` if not owned by this store.

#### `DELETE /store/products/:productId`

Deletes a product owned by this store. Success: `204 No Content`; missing/non-owned product returns `404`. Existing order snapshots are retained; cart lines referring to a deleted product will be reported unavailable.

#### `GET /store/orders`

Paged, newest-first list of this store's orders. Optional `orderStatus` filter and optional paired ISO-8601 `from`/`to` bounds on `createdAt` (`[from, to)`. Customer `userId` is populated with `name` and `phone`.

#### `GET /store/orders/:orderId`

Returns one order belonging to this store, with customer name and phone populated. Missing or non-owned order returns `404`.

#### `GET /store/orders/:orderId/invoice`

Downloads a PDF invoice for an order belonging to the authenticated store. The invoice uses the saved order item, price, customer, store, and delivery-address details, is stored with the order when first generated, and is returned as a private attachment on each download.

Missing or non-owned order returns `404`.

#### `PATCH /store/orders/:orderId/status`

Request:

```json
{ "orderStatus": "packing" }
```

Allowed requested values: `packing`, `out for delivery`, `delivered`, `cancelled`. The transition graph is constrained (see section 6). A paid order cannot be cancelled; an active payment attempt prevents cancellation; moving to `packing` requires payment status `paid` or `refund_failed`. Fulfillment cannot be advanced while a refund is pending. Success: `200 { "data": <updated order> }`. Invalid state transition returns `409`.

#### `POST /store/orders/:orderId/refund`

Store admins can request one full refund for an order they own while it is `placed` or `packing` and paid. The body is empty; the amount comes from the captured transaction. The order is cancelled and the customer notified in the same transaction that reserves the refund, before contacting Razorpay. A transactionally reserved refund is sent to Razorpay with an internal correlation token in `notes`. Pending requests are returned as `202` on retries without issuing another provider request. An uncertain provider response returns `502` but leaves the order cancelled and the refund pending; do not retry it manually.

Razorpay's signed `refund.processed` webhook atomically marks the transaction refunded and updates the cancellation notification with the completed refund. `refund.failed` marks the order's payment state `refund_failed`; the order remains cancelled and the customer is told to contact the store. Both events must carry the locally generated refund request token and the exact full refund amount. Customers cannot cancel or pay again while a refund is pending or after a refund outcome.

#### `GET /store/transactions`

Paged list of transactions belonging to this store's orders, newest transaction timestamp first. Optional `status` filter (`created`, `paid`, `failed`) and optional paired ISO-8601 `from`/`to` bounds on `timestamp` (`[from, to)`).

Returned transaction fields: `orderId`, `razorpayOrderId`, optional `paymentId`, `amount` (rupees), `status`, `refundStatus`, optional `refundId`, and `timestamp`.

**Success — `200 OK`:** CSV attachment with `Content-Type: text/csv`. Transaction export columns include `timestamp`, `order_id`, `status`, `amount`, `refund_status`, and `refund_id`.

#### `GET /store/transactions/:transactionId`

Returns a transaction only if its associated order belongs to this store. Success: `200 { "data": <transaction summary> }`; missing or non-owned transaction returns `404`.

## 5. Data models and relationships

Mongoose models use MongoDB collections `stores`, `users`, `products`, `carts`, `orders`, `transactions`, and the supporting collections `idempotencykeys`, `webhookevents`, `notifications`, and `auditevents`. Each model uses MongoDB `_id`; timestamps are present on Store, User, Product, Cart, Order, Notification, and AuditEvent. Transaction uses `timestamp` for payment activity. All references below are ObjectIds.

Store order-status changes, refund requests, product creation/updates/deletion, stock changes, and store open/close changes write a store-scoped audit event in the same transaction. Audit records contain IDs, action/state metadata, changed field names, and the request ID—not customer contact/address data or raw request bodies. A MongoDB TTL index expires records after one year; TTL removal is asynchronous. Audit records are not a substitute for financial ledgers or legal records.

### Store (`stores`)

| Field | Type | Rules |
| --- | --- | --- |
| `storeName` | String | Required, trimmed. |
| `username` | String | Required, unique, trimmed, lowercased. |
| `password` | String | Required, minimum 8 characters before hashing; bcrypt hash with cost 12; excluded from normal queries and JSON. |
| `location` | String | Required, trimmed. |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps. |

Stores do not embed product or order arrays; products/orders reference `storeId`.

### User (`users`)

| Field | Type | Rules |
| --- | --- | --- |
| `name` | String | Required, trimmed. |
| `phone` | String | Required, unique, trimmed; customer OTP identity. |
| `email` | String | Optional, lowercase, trimmed; unique when it is a string. |
| `addresses` | Array | Embedded address subdocuments with generated `_id`. |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps. |

Each address contains required `label`, `fullAddress`, and six-digit string `pincode`, plus `landmark` defaulting to an empty string. Cart and orders reference the user; the user does not embed cart or order IDs.

### Product (`products`)

| Field | Type | Rules |
| --- | --- | --- |
| `storeId` | ObjectId → Store | Required and indexed. |
| `productType` | String | Required built-in or store-created category name. |
| `pricingMode` | String | Optional for legacy built-in products; `weight` or `pack` for new/custom products. |
| `productName` | String | Required, trimmed. |
| `imageUrl` | String | Required, trimmed; API requires HTTP/HTTPS URL. |
| `inStock` | Boolean | Defaults to true. |
| `pricePerKg` | Number | Nonnegative when present; weight pricing in rupees/kg. |
| `pieceWeightGrams` | Number | Positive when present; permits piece pricing for weight-based product types. |
| `packs` | Array | `{ label, price }`; price is rupees, labels unique within the product. |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps. |

Compound index: `{ storeId: 1, productType: 1 }`. Products do not store cart or order arrays.

### Cart (`carts`)

| Field | Type | Rules |
| --- | --- | --- |
| `userId` | ObjectId → User | Required, unique (one cart per user). |
| `items` | Array | Embedded cart lines with generated line `_id`. |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps. |

Each line has `productId`, `selectionType`, `selectedQuantity`, and optional `selectedPackLabel`. Weight is kilograms; pieces and pack counts are whole numbers. There is intentionally no stored cart total; response totals use current product prices.

### Order (`orders`)

| Field | Type | Rules |
| --- | --- | --- |
| `userId` | ObjectId → User | Required and indexed. |
| `storeId` | ObjectId → Store | Required and indexed. |
| `deliveryAddress` | Embedded snapshot | `label`, `fullAddress`, `landmark`, `pincode`; no live address reference. |
| `items` | Array | Nonempty order-time product snapshots. |
| `totalAmount` | Number | Server-calculated total in rupees, rounded to paise. |
| `orderStatus` | String | `placed`, `packing`, `out for delivery`, `delivered`, `cancelled`; defaults to `placed`. |
| `paymentStatus` | String | `pending`, `paid`, `failed`, `refund_pending`, `refunded`, `refund_failed`; defaults to `pending` for legacy records. New orders are created only after verified payment with status `paid`. |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps. |

Each order item stores `productId`, copied `productName`, `selectionType`, `quantity`, optional `packLabel`, and copied line `price`. Historical order names/prices and delivery address do not change when catalog or profile data changes. The order schema recalculates `totalAmount` from item line prices during validation.

Indexes include `{ storeId: 1, createdAt: -1 }` and `{ userId: 1, createdAt: -1 }`.

### Transaction (`transactions`)

| Field | Type | Rules |
| --- | --- | --- |
| `orderId` | ObjectId → Order | Required and indexed. |
| `razorpayOrderId` | String | Required, unique, trimmed. |
| `paymentId` | String | Optional, unique when present (sparse index). |
| `amount` | Number | Required, nonnegative rupees. |
| `status` | String | `created`, `paid`, `failed`; defaults to `created`. |
| `refundStatus` | String | `none`, `pending`, `processed`, `failed`; defaults to `none`. |
| `refundId` | String | Optional Razorpay refund ID. |
| `refundRequestId` | String | Optional internal token included in Razorpay notes to correlate refund webhooks. |
| `timestamp` | Date | Defaults to current time. |

Partial unique index `{ orderId: 1, status: 1 }` for `status: "created"` permits at most one created transaction per order. Refund initiation reserves the paid transaction before contacting Razorpay, and webhook outcomes update its refund state atomically with the order and customer notification. Transaction is the payment/refund record; order stores the current `paymentStatus`.

### IdempotencyKey (`idempotencykeys`)

Additional operational model used by checkout:

| Field | Type | Purpose |
| --- | --- | --- |
| `key` | String | Client-supplied `Idempotency-Key` header. |
| `userId` | ObjectId | Key owner. |
| `orderId` | ObjectId → Order | Set to the order produced by a successful checkout. |
| `status` | String | `in_progress`, `done`, or `failed`; defaults to `in_progress`. |
| `createdAt` | Date | Creation time. |

Unique compound index `{ key: 1, userId: 1 }` makes keys user-scoped.

### WebhookEvent (`webhookevents`)

Additional operational model used for webhook deduplication:

| Field | Type | Purpose |
| --- | --- | --- |
| `razorpayEventId` | String | Required, unique; current code stores the Razorpay payment ID here. |
| `receivedAt` | Date | Defaults to current time. |
| `processed` | Boolean | Defaults to false. |
| `processedAt` | Date | Set after processing. |

See the payment webhook caveat in section 4.6: this currently is not Razorpay's top-level webhook event ID.

## 6. Pricing, checkout, and order lifecycle rules

### Server-side pricing

Clients send product selections, never authoritative prices. The server looks up current product pricing and calculates line totals.

| Selection | Product support | Calculation |
| --- | --- | --- |
| `weight` | Meat, vegetable, fruit; loose rice with `pricePerKg` | `pricePerKg × selectedQuantityKg`. |
| `pieces` | Meat, vegetable, fruit with `pieceWeightGrams` | `pricePerKg × pieceWeightGrams / 1000 × piece count`. |
| `pack` | Oil and packaged rice | Matching pack's individual price × whole number of packs. |

Line prices and order totals are rounded to two decimal places (paise precision). Pack prices are independent; the server does not assume a larger pack costs an exact multiple of a smaller pack.

### Checkout transaction behavior

Checkout validates products and prices, stores the selected address/items/total in a temporary CheckoutAttempt, and creates a Razorpay payment order. This phase does not create an Order or change the Cart. After Razorpay confirms capture, signature/provider verification precedes a MongoDB transaction that creates the paid Order, Transaction and placed Notification, marks the attempt paid, and removes only matching purchased cart lines. Failed or dismissed attempts are marked failed and never become orders. Attempts expire after 24 hours. The UUID idempotency key is scoped to the authenticated user.

### Order state transitions

Valid lifecycle transitions:

```text
placed -> packing -> out for delivery -> delivered
   |          |
   +----------+-> cancelled (subject to cancellation rules)
```

More precisely:

- `placed` can advance to `packing` or be cancelled.
- `packing` can advance to `out for delivery` or be cancelled.
- `out for delivery` can advance only to `delivered`.
- `delivered` and `cancelled` are terminal.
- Store must confirm `paymentStatus: "paid"` before moving an order to `packing`.
- Paid orders cannot be cancelled through the status endpoint. Store admins can use the full-refund endpoint for paid `placed` or `packing` orders. Refund-pending orders are paused; processed refunds cancel the order, and failed refunds leave it paid.
- A created payment transaction prevents cancellation until it is no longer active.

## 7. Frontend integration workflow

Suggested customer flow:

1. Browse stores with `GET /stores`; browse stock with `GET /products?storeId=<id>`.
2. Authenticate using the OTP endpoints and store the returned user token securely.
3. Load profile/address list from `GET /users/me`; create an address if needed.
4. Add products to the cart using `POST /cart/items`; show prices from `GET /cart` and handle unavailable lines.
5. Start payment using `POST /payments/razorpay/order` with the saved `addressId`, selected `storeId` when needed, and a UUID idempotency key; this creates only a temporary checkout attempt.
6. Open Razorpay Checkout with the returned payment parameters. If payment fails or the window is dismissed, call the failed-attempt endpoint; the cart remains and no order exists.
7. On successful checkout, send the Razorpay callback values to `POST /payments/razorpay/verify`; only after server confirmation does the API create the paid order and clear the purchased cart lines.
8. Refresh the returned order using `GET /orders/:orderId` and display backend `orderStatus` and `paymentStatus`.

Suggested store-admin flow:

1. Sign in using the provisioned username/password at `POST /auth/stores/login`.
2. Load `GET /store/dashboard`.
3. Manage the store's inventory through `/store/products` and the stock endpoint.
4. Load the store's orders and transactions through their paginated endpoints.
5. Advance order status only when the current status and payment state permit it; request a full refund for an eligible paid order through `POST /store/orders/:orderId/refund`.

Always handle errors from the API rather than assuming a request succeeded. In particular, refresh the cart before checkout, do not trust client-calculated prices, and do not mark payment successful until server verification or a later order refresh confirms it.

## 8. MVC and source layout

```text
src/
  app.js                 Express middleware and route mounting
  server.js              Environment checks, MongoDB connection, HTTP listener
  config/database.js     Mongoose connection
  controllers/           Request handlers/business orchestration
  middleware/            Authentication, validation, 404, error handling
  models/                Mongoose document schemas and indexes
  routes/                Endpoint declarations and role protection
  services/              Firebase Admin token verification and Razorpay client wrappers
  utils/                 Application errors, pricing, regex escaping
  validation/schemas.js  Zod request schemas
scripts/
  createStore.js         Trusted interactive store provisioning
test/
  api.test.js
  models.test.js
```

The API router is mounted under `/api`. The raw Razorpay webhook route is mounted before `express.json()` to preserve the exact request bytes needed for signature verification. Route handlers use centralized validation and error middleware.

## 9. Scope and known limitations

- OTP delivery requires Firebase Phone Authentication, frontend Firebase web configuration, Firebase Admin service-account credentials on the API, and authorized frontend domains. Firebase quotas and billing depend on the project plan.
- Online payment flows require configured Razorpay keys; webhook processing additionally requires its webhook secret.
- Transactions require a replica set or equivalent transaction-capable MongoDB deployment.
- The API has no customer password flow, store self-registration, password-reset flow, refresh tokens, partial refunds, shipping-rate calculation, or file-upload endpoint.
- Product images are represented by an externally hosted `imageUrl`; image storage/CDN management is outside this API.
- Product discovery exposes only in-stock products; store inventory listing includes out-of-stock items.
- Cart totals are recalculated using current catalog pricing. Order snapshots preserve the final selected item names and prices.
- Rate limiting uses the process's configured default in-memory store; it is not shared across multiple server instances.
- Refund requests with uncertain provider responses remain pending and are not automatically retried, preventing duplicate refunds; operations must reconcile these requests with Razorpay if the signed outcome webhook does not arrive.

## 10. Postman quick reference

Set a Postman environment variable `baseUrl` to `http://localhost:3000/api`. For protected endpoints, set:

```text
Authorization: Bearer {{token}}
Content-Type: application/json
```

For checkout, additionally send:

```text
Idempotency-Key: {{$guid}}
```

Use the ID values returned by the server rather than hard-coding IDs. Never store the Razorpay secret or webhook secret in a browser/Postman collection intended for frontend developers.
