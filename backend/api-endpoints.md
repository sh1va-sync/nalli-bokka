# Nalli Bokka API Endpoint Reference

This is the frontend-focused reference for the currently implemented HTTP API. Each endpoint explains its purpose, access requirements, request format, successful response, and relevant errors or behavior.

## Contents

- [General conventions](#general-conventions)
- [Health and authentication](#health-and-authentication)
- [Customer profile and addresses](#customer-profile-and-addresses)
- [Public stores and products](#public-stores-and-products)
- [Customer cart](#customer-cart)
- [Customer orders](#customer-orders)
- [Payments](#payments)
- [Store dashboard and operations](#store-dashboard-and-operations)
- [Common errors](#common-errors)
- [Suggested customer flow](#suggested-customer-flow)

## General conventions

### Base URL

Local development:

```text
http://localhost:3000/api
```

Append each endpoint path below to the base URL. For example, the full local OTP URL is `http://localhost:3000/api/auth/users/otp`.

### Headers

For JSON requests, send:

```http
Content-Type: application/json
```

Protected endpoints also require:

```http
Authorization: Bearer <JWT>
```

Checkout can additionally receive:

```http
Idempotency-Key: <unique-client-generated-key>
```

Every response includes an `X-Request-Id` header. The backend logs structured request completion records to the console without recording request bodies, authorization headers, or query-string values.

The Razorpay webhook is the exception to the JSON-body rule: it receives the raw JSON bytes and Razorpay `x-razorpay-signature` and `x-razorpay-event-id` headers.

### Authentication roles

- **Public:** No token required.
- **Customer:** Use the JWT returned by customer OTP verification.
- **Store:** Use the JWT returned by store login.
- Customer and store tokens are not interchangeable. A token with the wrong role receives `403`.
- `GET /auth/me` accepts either role.

### Data formats

- IDs are MongoDB ObjectIds represented as 24-character hexadecimal strings.
- Request/response prices are in rupees unless an endpoint explicitly says paise.
- Dates are ISO-8601 strings.
- Validation is strict: unknown body/query fields are rejected.
- Standard paginated response:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "pages": 0
  }
}
```

Pagination query parameters are `page` (default `1`, integer >= 1) and `limit` (default `20`, integer 1–100).

## Health and authentication

### `GET /health`

**Access:** Public  
**Purpose:** Confirms that the HTTP process is responding. This is a liveness endpoint and does not test MongoDB connectivity.

**Request:** No body or query parameters.

**Success — `200 OK`:**

```json
{ "status": "ok" }
```

### `GET /health/ready`

**Access:** Public. **Purpose:** Readiness check for deployment probes. Returns ready only when MongoDB is connected.

**Success — `200 OK`:**

```json
{ "status": "ready" }
```

**MongoDB unavailable — `503 Service Unavailable`:**

```json
{ "status": "not_ready" }
```

### `POST /auth/users/otp`

**Access:** Public  
**Purpose:** Requests a Twilio Verify SMS code for a customer phone number. This endpoint does not create a customer account or return a token.

**Request body:**

```json
{ "phone": "+15551234567" }
```

`phone` is required and must use E.164 format (`+` followed by 8–15 digits, first digit nonzero).

**Success — `202 Accepted`:**

```json
{ "message": "Verification code sent" }
```

**Important errors and behavior:**

- `400`: Invalid phone or extra/unrecognized request fields.
- `429`: More than 5 OTP request/verification attempts within the 10-minute rate-limit window for the client IP.
- `503`: Twilio Verify is not configured.
- The SMS delivery is handled by Twilio; the frontend should wait for the user to enter the received code.

### `POST /auth/users/verify`

**Access:** Public  
**Purpose:** Validates the SMS code. Existing customers receive a customer token; first-time customers receive a short-lived registration token and must finish account creation.

**Request body:**

```json
{
  "phone": "+15551234567",
  "code": "123456"
}
```

| Field | Requirement |
| --- | --- |
| `phone` | Required; E.164 format and should be the number used to request the OTP. |
| `code` | Required; 4–10 numeric digits. |

**Success for an existing customer — `200 OK`:**

```json
{
  "token": "<customer-jwt>",
  "user": {
    "_id": "<userId>",
    "name": "Asha Rao",
    "phone": "+15551234567",
    "email": "asha@example.com",
    "addresses": [],
    "createdAt": "<ISO-8601>",
    "updatedAt": "<ISO-8601>"
  }
}
```

The frontend should retain the token and send it as a bearer token on customer routes. The password-free user object is the authenticated account profile.

For a first-time customer, the response is instead:

```json
{
  "isNewUser": true,
  "verificationToken": "<short-lived-registration-jwt>"
}
```

### `POST /auth/users/register`

**Access:** Public; requires a valid registration token returned by OTP verification.
**Purpose:** Creates the new customer account after the phone number is verified.

**Request body:**

```json
{
  "verificationToken": "<short-lived-registration-jwt>",
  "name": "Asha Rao",
  "email": "asha@example.com"
}
```

`name` is required (1–100 characters); `email` is optional (valid email, maximum 254 characters).

**Success — `201 Created`:** `{ "isNewUser": true, "token": "<customer-jwt>", "user": <customer> }`

**Important errors and behavior:**

- `400`: Invalid body or extra/unrecognized request fields.
- `401`: Invalid or expired code.
- `409`: An account already exists for the verified phone, or email is already used by another account.
- `429`: OTP endpoint rate limit exceeded.
- `503`: Twilio or secure JWT configuration is unavailable.

### `POST /auth/stores/login`

**Access:** Public  
**Purpose:** Authenticates a store admin account provisioned by the backend operator. There is no public store registration endpoint.

**Request body:**

```json
{
  "username": "nalli-hyderabad",
  "password": "<store-password>"
}
```

Both fields are required. Usernames are normalized to lowercase for lookup. Password is never returned by the API.

**Success — `200 OK`:**

```json
{
  "token": "<store-jwt>",
  "store": {
    "id": "<storeId>",
    "storeName": "Nalli Bokka",
    "username": "nalli-hyderabad",
    "location": "Hyderabad"
  }
}
```

**Important errors and behavior:**

- `400`: Invalid body.
- `401`: Invalid username or password.
- `429`: More than 10 login attempts within the 15-minute rate-limit window for the client IP.
- `503`: Secure JWT configuration is unavailable.

### `GET /auth/me`

**Access:** Customer or store  
**Purpose:** Retrieves the account associated with the bearer token. Use this to validate a persisted login after the frontend loads.

**Request:** `Authorization: Bearer <JWT>`.

**Success — `200 OK`:**

```json
{
  "account": {
    "_id": "<accountId>",
    "...": "User or Store fields"
  },
  "role": "user"
}
```

`role` is either `user` or `store`. Store passwords are not included.

**Important errors:** `401` for missing, invalid, expired, or deleted-account credentials.

## Customer profile and addresses

All endpoints in this section require a customer bearer token.

### `GET /users/me`

**Purpose:** Loads the authenticated customer's profile and saved addresses.

**Request:** No body or query parameters.

**Success — `200 OK`:**

```json
{
  "data": {
    "_id": "<userId>",
    "name": "Asha Rao",
    "phone": "+15551234567",
    "email": "asha@example.com",
    "addresses": [
      {
        "_id": "<addressId>",
        "label": "Home",
        "fullAddress": "12 Example Road, Hyderabad",
        "landmark": "Near the park",
        "pincode": "500001"
      }
    ],
    "createdAt": "<ISO-8601>",
    "updatedAt": "<ISO-8601>"
  }
}
```

`email` may be absent. Each embedded address has its own `_id`, used by address update/delete and checkout.

**Important errors:** `401` authentication required/invalid; `404` if the authenticated user no longer exists.

### `PATCH /users/me`

**Purpose:** Updates the current customer's name and/or email. At least one field must be supplied.

**Request body:**

```json
{ "name": "Asha R.", "email": "asha@example.com" }
```

- `name`: Optional; trimmed, 1–100 characters.
- `email`: Optional; valid email up to 254 characters, or `""` to remove it.
- Extra fields are rejected.

**Success — `200 OK`:** `{ "data": <updated user> }`.

**Important errors:** `400` invalid/empty update; `401` unauthorized; `404` user missing; `409` email already belongs to another user.

### `POST /users/me/addresses`

**Purpose:** Adds a saved delivery address to the current customer's profile.

**Request body:**

```json
{
  "label": "Home",
  "fullAddress": "12 Example Road, Hyderabad",
  "landmark": "Near the park",
  "pincode": "500001"
}
```

| Field | Requirement |
| --- | --- |
| `label` | Required, 1–40 characters (for example Home or Work). |
| `fullAddress` | Required, 5–500 characters. |
| `landmark` | Optional, up to 200 characters; defaults to empty string. |
| `pincode` | Required string of exactly 6 digits. |

**Success — `201 Created`:**

```json
{
  "data": {
    "_id": "<newAddressId>",
    "label": "Home",
    "fullAddress": "12 Example Road, Hyderabad",
    "landmark": "Near the park",
    "pincode": "500001"
  }
}
```

Use the returned `_id` for future address operations and order checkout.

**Important errors:** `400` invalid address; `401` unauthorized; `404` user missing.

### `PATCH /users/me/addresses/:addressId`

**Purpose:** Partially updates one address belonging to the authenticated customer.

**Path parameter:** `addressId` is the embedded address `_id`.

**Request body:** At least one address field; same constraints as address creation. Example:

```json
{ "label": "Work", "pincode": "500002" }
```

**Success — `200 OK`:** `{ "data": <updated address including _id> }`.

**Important errors:** `400` invalid ID/body; `401` unauthorized; `404` address does not exist on this user's profile.

### `DELETE /users/me/addresses/:addressId`

**Purpose:** Deletes one saved address belonging to the authenticated customer.

**Success — `204 No Content`:** Response has no body.

**Important errors:** `400` invalid ID; `401` unauthorized; `404` address not found. If an address is used for a later order, that order retains its own delivery-address snapshot.

### `GET /users/me/notifications`

**Purpose:** Lists order-status notifications for the authenticated customer, newest first. Accepts `page` and `limit` pagination parameters.

**Success — `200 OK`:**

```json
{
  "data": [
    {
      "_id": "<notificationId>",
      "orderId": "<orderId>",
      "orderStatus": "out for delivery",
      "title": "Order status updated",
      "message": "Your order is out for delivery.",
      "readAt": null,
      "createdAt": "<ISO-8601>",
      "updatedAt": "<ISO-8601>"
    }
  ],
  "unreadCount": 1,
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

### `PATCH /users/me/notifications/:notificationId/read`

**Purpose:** Marks one notification belonging to the authenticated customer as read.

**Success — `200 OK`:** `{ "data": <updated notification> }`.

**Important errors:** `400` malformed notification ID; `401` unauthorized; `404` notification not found for this customer.

### `PATCH /users/me/notifications/read-all`

**Purpose:** Marks all unread notifications belonging to the authenticated customer as read.

**Success — `200 OK`:** `{ "data": { "updatedCount": 3 } }`.

## Public stores and products

### `GET /stores`

**Access:** Public  
**Purpose:** Lists stores for store selection. Does not expose store credentials.

**Query parameters:** `page`, `limit`, optional `search` (store-name search, max 100 characters).

**Success — `200 OK`:**

```json
{
  "data": [
    {
      "_id": "<storeId>",
      "storeName": "Nalli Bokka",
      "location": "Hyderabad"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

Search is case-insensitive. Only public store fields are selected.

**Important errors:** `400` invalid pagination/query.

### `GET /stores/:id`

**Access:** Public  
**Purpose:** Gets public details for one store.

**Path parameter:** `id` is the store ObjectId.

**Success — `200 OK`:**

```json
{
  "data": {
    "_id": "<storeId>",
    "storeName": "Nalli Bokka",
    "location": "Hyderabad"
  }
}
```

**Important errors:** `400` malformed ObjectId; `404` store not found. Password is never returned.

### `GET /products`

**Access:** Public  
**Purpose:** Searches the currently available catalog. Products with `inStock: false` are omitted.

**Query parameters:**

| Parameter | Optional | Description |
| --- | --- | --- |
| `page` | Yes | Page number, default 1. |
| `limit` | Yes | Page size, default 20, maximum 100. |
| `storeId` | Yes | Restrict results to one store ObjectId. |
| `productType` | Yes | `meat`, `vegetable`, `fruit`, `oil`, or `rice`. |
| `search` | Yes | Product-name substring, case-insensitive, max 100 characters. |

**Success — `200 OK`:**

```json
{
  "data": [
    {
      "_id": "<productId>",
      "storeId": {
        "_id": "<storeId>",
        "storeName": "Nalli Bokka",
        "location": "Hyderabad"
      },
      "productType": "meat",
      "productName": "Mutton",
      "imageUrl": "https://cdn.example.com/mutton.jpg",
      "inStock": true,
      "pricePerKg": 800,
      "pieceWeightGrams": 250,
      "packs": [],
      "createdAt": "<ISO-8601>",
      "updatedAt": "<ISO-8601>"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

For a product type not using a field, such as `packs` for meat, the field may be empty or omitted according to the serialized document. Prices are rupees, not paise.

**Important errors:** `400` invalid filter or pagination.

### `GET /products/:id`

**Access:** Public  
**Purpose:** Gets one currently in-stock product with public store details populated.

**Success — `200 OK`:** `{ "data": <product with populated storeId> }`.

**Important errors:** `400` malformed ObjectId; `404` product missing or out of stock.

## Customer cart

All cart endpoints require a customer token. A customer has at most one cart. Prices are recalculated from current product pricing whenever a cart is returned.

### Cart selection format

`POST /cart/items` and `PATCH /cart/items/:itemId` use a selection:

```json
{
  "selectionType": "weight",
  "selectedQuantity": 0.5
}
```

Valid `selectionType` values:

- `weight`: `selectedQuantity` is kilograms (`0.25` means 250 g). Allowed for meat, vegetables, fruit, and loose rice.
- `pieces`: `selectedQuantity` is a whole number of pieces. Product must be configured with `pieceWeightGrams`; only meat, vegetables, and fruit support this mode.
- `pack`: `selectedQuantity` is a whole number of packs and requires `selectedPackLabel` matching a configured pack label exactly.

### `GET /cart`

**Purpose:** Retrieves the current cart, including availability and current prices.

**Success — `200 OK`:**

```json
{
  "data": {
    "items": [
      {
        "itemId": "<cartLineId>",
        "productId": "<productId>",
        "productName": "Mutton",
        "imageUrl": "https://cdn.example.com/mutton.jpg",
        "selectionType": "weight",
        "selectedQuantity": 0.5,
        "available": true,
        "unitPrice": 800,
        "lineTotal": 400
      }
    ],
    "total": 400,
    "hasUnavailableItems": false
  }
}
```

`unitPrice` is rupees per kilogram for weight selections, computed per piece for piece selections, and the individual pack price for pack selections. `lineTotal` is the current line price in rupees.

If no cart exists, the endpoint returns an empty `items` list, `total: 0`, and `hasUnavailableItems: false`. A missing/deleted product or invalid/out-of-stock selection is returned as an unavailable item with an `issue`; then `total` is `null` and `hasUnavailableItems` is `true`. The frontend should resolve unavailable lines before checkout.

**Important errors:** `401` missing/invalid customer token.

### `POST /cart/items`

**Purpose:** Adds a new selection to the cart. If a line with the same product, selection type, and pack label already exists, the requested quantity is added to that line rather than creating a duplicate line.

**Request body (weight or pieces):**

```json
{
  "productId": "<productId>",
  "selectionType": "weight",
  "selectedQuantity": 0.5
}
```

**Request body (pack):**

```json
{
  "productId": "<productId>",
  "selectionType": "pack",
  "selectedQuantity": 2,
  "selectedPackLabel": "5 L"
}
```

**Success — `201 Created`:** `{ "data": <current cart response> }`.

**Important errors:** `400` incompatible selection, invalid quantity, or unknown pack label; `401` unauthorized; `404` product missing; `409` product out of stock or combined quantity not valid.

### `PATCH /cart/items/:itemId`

**Purpose:** Replaces the selection type/quantity/pack for one existing cart line. It does not add to the previous quantity.

**Request body:** Selection format above; do not include `productId`.

**Success — `200 OK`:** `{ "data": <current cart response> }`.

**Important errors:** `400` invalid or unsupported selection; `401` unauthorized; `404` cart line or product missing; `409` product out of stock.

### `DELETE /cart/items/:itemId`

**Purpose:** Removes a cart line.

**Success — `200 OK`:** `{ "data": <updated cart response> }`.

**Important errors:** `400` malformed line ID; `401` unauthorized; `404` cart line missing.

## Customer orders

All endpoints in this section require a customer token. Customers can only read, pay, or cancel their own orders.

### `POST /orders`

This endpoint is not available. For new purchases, an order is created only after the payment provider confirms a captured payment through `POST /payments/razorpay/verify`. Use the checkout payment endpoint documented in the Payments section to start checkout. A failed or dismissed payment does not create an order and leaves cart items unchanged.

### `GET /orders`

**Purpose:** Lists the authenticated customer's orders, newest first.

**Query parameters:** Standard pagination; optional `orderStatus` (`placed`, `packing`, `out for delivery`, `delivered`, or `cancelled`); optional `from` and `to` ISO-8601 timestamps, supplied together, to restrict `createdAt` to `[from, to)`.

**Success — `200 OK`:** Paginated response. Each order's `storeId` is populated with public store fields (`_id`, `storeName`, `location`).

**Important errors:** `400` invalid query; `401` unauthorized.

### `GET /orders/:orderId`

**Purpose:** Retrieves a single order belonging to the authenticated customer.

**Success — `200 OK`:**

```json
{
  "data": {
    "_id": "<orderId>",
    "userId": "<userId>",
    "storeId": {
      "_id": "<storeId>",
      "storeName": "Nalli Bokka",
      "location": "Hyderabad"
    },
    "items": [],
    "totalAmount": 400,
    "orderStatus": "placed",
    "paymentStatus": "pending"
  }
}
```

Other order fields such as the delivery-address snapshot and timestamps are included in the returned document.

**Important errors:** `400` invalid ObjectId; `401` unauthorized; `404` order does not exist or is not owned by this user.

### `POST /orders/:orderId/cancel`

**Purpose:** Cancels an unpaid order while its current order state permits cancellation.

**Request:** No body. The order ID must belong to the authenticated customer.

**Success — `200 OK`:** `{ "data": <updated order with orderStatus "cancelled"> }`.

**Cancellation is rejected (`409`) if:**

- The order is already out for delivery, delivered, or cancelled.
- The payment has been captured or a refund is pending, failed, or complete (`paid`, `refund_pending`, `refund_failed`, or `refunded`).
- A payment transaction is still `created`.

Also returns `404` for an unknown/non-owned order and `401` for unauthorized access.

## Payments

Payment endpoints integrate Razorpay. Never put `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` in browser code. Razorpay payment amounts use paise, unlike order/product prices which use rupees.

### `POST /payments/razorpay/order`

**Access:** Customer
**Purpose:** Validates the saved address, selected store, cart availability and current prices, then creates a short-lived `CheckoutAttempt` and Razorpay payment order. It does not create an Order or modify the cart.

**Request body:**

```json
{
  "addressId": "<savedAddressId>",
  "storeId": "<storeId>",
  "idempotencyKey": "<uuid>"
}
```

`storeId` may be omitted only if the cart contains products from one store. The key must be a UUID and is scoped to the customer. Reuse it only for retries of the same request; use a new key to begin a new payment attempt.

**Success - `201 Created` (or `200 OK` for an active idempotent retry):**

```json
{
  "data": {
    "razorpayOrderId": "order_...",
    "keyId": "<public-razorpay-key-id>",
    "amount": 40000,
    "currency": "INR"
  }
}
```

`amount` is paise. Use these values to open Razorpay Checkout. No order exists yet and the cart remains unchanged.

**Important errors:** `400` invalid body, empty cart, or non-positive total; `401` unauthorized; `404` user or saved address missing; `409` unavailable/invalid products, selected store mismatch, mixed-store cart without `storeId`, or inactive idempotency key; `503` Razorpay is not configured. MongoDB must support transactions for final order creation.

### `POST /payments/razorpay/:razorpayOrderId/failed`

**Access:** Customer
**Purpose:** Marks the authenticated customer's checkout attempt failed after the payment window is dismissed or Razorpay reports a failed payment. It never creates an order and does not clear the cart. No request body is required.

**Success - `200 OK`:** `{ "data": { "status": "failed", "orderCreated": false } }`.

**Important errors:** `401` unauthorized; `404` attempt not found or not owned by this customer; `409` payment has already been confirmed.

### `POST /orders/:orderId/payment`

**Access:** Customer  
**Purpose:** Legacy payment retry for an already-persisted unpaid order. New checkouts must use `POST /payments/razorpay/order` instead.

**Request:** No body. Path `orderId` identifies the order; bearer token identifies the customer.

**Success - `201 Created`:**

```json
{
  "data": {
    "transactionId": "<transactionId>",
    "razorpayOrderId": "order_...",
    "keyId": "<public-razorpay-key-id>",
    "amount": 40000,
    "currency": "INR"
  }
}
```

`amount` is paise. The server derives it from the existing order. This endpoint remains for older unpaid orders only.

**Important errors:** `400` amount is not positive; `401` unauthorized; `404` order missing/not owned; `409` order is cancelled, paid, or in a refund state; `503` Razorpay is not configured.

### `POST /payments/razorpay/verify`

**Access:** Customer  
**Purpose:** Verifies the Razorpay Checkout callback server-side. Checks the signature, fetches the payment, and confirms the order, amount, currency, and captured status. For a new checkout it atomically creates the paid order, paid transaction, and placed notification, then removes only the purchased matching cart lines. For a legacy persisted order it updates that order and its transaction. Failed payments never produce a new order.

**Request body:**

```json
{
  "razorpayOrderId": "order_...",
  "paymentId": "pay_...",
  "signature": "<64-character-hex-signature>"
}
```

All fields are required. The signature must be 64 hexadecimal characters.

**Success — `200 OK`:**

```json
{
  "data": {
    "orderId": "<orderId>",
    "paymentStatus": "paid"
  }
}
```

The frontend should then reload `GET /orders/:orderId` to display the persisted state.

**Important errors:**

- `400`: Invalid request or payment signature.
- `401`: Missing/invalid customer token.
- `404`: Payment transaction or customer-owned order not found.
- `409`: Razorpay reports a payment that is not captured or whose order ID, amount, or currency does not match the expected transaction.
- `503`: Online payment configuration is unavailable.
- MongoDB transaction errors if the deployment does not support transactions.

### `POST /api/payments/razorpay/webhook`

**Access:** Razorpay server-to-server; no customer/store JWT.  
**Purpose:** Receives payment events from Razorpay and updates local payment/order state. Configure this full URL in the Razorpay dashboard:

```text
https://<api-host>/api/payments/razorpay/webhook
```

The webhook must be delivered with `Content-Type: application/json`, original raw JSON bytes, a valid `x-razorpay-signature` generated using the configured webhook secret, and Razorpay's `x-razorpay-event-id` header.

**Handled event types:** `payment.captured`, `payment.failed`, `refund.processed`, and `refund.failed`. Other event names are acknowledged but ignored.

**Success — `200 OK`:**

```json
{ "received": true }
```

For handled events, the payment entity must include `order_id`, `id`, `amount`, and `currency`; `order_id` must match a locally stored Razorpay order and amount/currency must match its transaction.

**Important errors:** `400` missing/invalid signature, missing event ID, malformed JSON, or missing payment details; `404` no local transaction for the Razorpay order; `409` amount/currency mismatch; `503` webhook secret is not configured. Settlement uses a MongoDB transaction.

Webhook delivery is deduplicated by Razorpay's event ID, so distinct event types for one payment are processed independently. Webhook responses are server-to-server; the frontend should use payment verification and reload the order for UI state.

## Store dashboard and operations

All routes in this section require a store JWT. Data access is always scoped to the store ID in that token; clients cannot operate on another store's inventory or orders.

### `GET /store/dashboard`

**Purpose:** Returns inventory counts, order counts, paid revenue, and recent orders for the signed-in store.

**Query parameters:** Optional `days` integer 1–90 (default `7`) controls the rolling paid-revenue summary. Optional `from` and `to` ISO-8601 timestamps must be supplied together and define an exact reporting interval (inclusive `from`, exclusive `to`) for the daily order and transaction aggregates.

**Success — `200 OK`:**

```json
{
  "data": {
    "inventory": {
      "inStock": 12,
      "outOfStock": 2
    },
    "ordersByStatus": {
      "placed": 3,
      "packing": 1
    },
    "paidRevenue": {
      "sinceDays": 7,
      "amount": 4200,
      "orders": 6
    },
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

Revenue is in rupees. `paidRevenue` includes paid orders created within the selected lookback period. When `from` and `to` are supplied, `periodMetrics` counts orders by order creation time and transaction amounts/statuses by transaction time for the exact interval. `recentOrders` contains up to 10 newest orders and includes customer `name` and `phone`.

**Important errors:** `400` invalid `days` or date interval; `401` missing/invalid token; `403` non-store token.

### `GET /store/products`

**Purpose:** Lists this store's inventory, including out-of-stock products.

**Query parameters:** Standard pagination; optional `productType` (`meat`, `vegetable`, `fruit`, `oil`, `rice`) and `search` (product-name substring, max 100 characters).

**Success — `200 OK`:** Paginated envelope containing this store's product documents.

**Important errors:** `400` invalid query; `401` unauthorized; `403` customer token.

### `POST /store/products`

**Purpose:** Creates an inventory product owned by the authenticated store. Do not send `storeId`; it is derived from the token.

**Request body (weight-based product example):**

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

**Request body (pack-based product example):**

```json
{
  "productType": "oil",
  "productName": "Groundnut oil",
  "imageUrl": "https://cdn.example.com/oil.jpg",
  "packs": [
    { "label": "1 L", "price": 220 },
    { "label": "5 L", "price": 1020 }
  ]
}
```

Fields:

- `productType`: Required enum: `meat`, `vegetable`, `fruit`, `oil`, `rice`.
- `productName`: Required, 1–120 characters.
- `imageUrl`: Required HTTP/HTTPS URL, maximum 2048 characters.
- `inStock`: Optional boolean; defaults to true.
- `pricePerKg`: Optional nonnegative rupee price per kg.
- `pieceWeightGrams`: Optional positive number; enables pieces for meat/vegetable/fruit.
- `packs`: Optional array (up to 50) of objects with required `label` (1–40 characters) and nonnegative `price` in rupees.

Pricing modes: meat/vegetable/fruit require `pricePerKg` and no packs; oil requires packs and no `pricePerKg`; rice must have either `pricePerKg` (loose) or packs (packaged), but not both. Pack labels must be unique within the product.

**Success — `201 Created`:** `{ "data": <created product document> }`.

**Important errors:** `400` invalid request or incompatible pricing mode; `401` unauthorized; `403` customer token; `409` duplicate/conflicting database constraint.

### `PATCH /store/products/:productId`

**Purpose:** Updates this store's product. At least one supported field must be supplied.

**Path parameter:** `productId` is the product ObjectId.

**Request body:** Any nonempty subset of product creation fields. `pricePerKg` and `pieceWeightGrams` may be `null` to clear those fields; resulting pricing mode is validated before saving.

Example:

```json
{
  "pricePerKg": 850,
  "inStock": false
}
```

**Success — `200 OK`:** `{ "data": <updated product document> }`.

**Important errors:** `400` invalid ID/body or resulting pricing mode; `401` unauthorized; `403` customer token; `404` product is missing or not owned by this store.

### `PATCH /store/products/:productId/stock`

**Purpose:** Quickly marks one of this store's products in stock or sold out.

**Request body:**

```json
{ "inStock": false }
```

**Success — `200 OK`:** `{ "data": <updated product document> }`.

**Important errors:** `400` invalid ID/body; `401` unauthorized; `403` customer token; `404` product missing or not owned by this store.

### `DELETE /store/products/:productId`

**Purpose:** Deletes one of this store's products.

**Success — `204 No Content`:** No response body. Existing orders retain their product-name/price snapshots. Cart entries referring to a deleted product become unavailable when the cart is loaded.

**Important errors:** `400` invalid ID; `401` unauthorized; `403` customer token; `404` product missing or not owned by this store.

### `GET /store/orders`

**Purpose:** Lists orders belonging to this store, newest first.

**Query parameters:** Standard pagination; optional `orderStatus` enum: `placed`, `packing`, `out for delivery`, `delivered`, `cancelled`; optional `from` and `to` ISO-8601 timestamps, supplied together, to restrict `createdAt` to `[from, to)`.

**Success — `200 OK`:** Paginated orders. `userId` is populated with the customer `name` and `phone`; `storeId` is populated with public store fields.

**Important errors:** `400` invalid query; `401` unauthorized; `403` customer token.

### `GET /store/orders/:orderId`

**Purpose:** Retrieves one order belonging to this store, including customer name and phone.

**Success — `200 OK`:** `{ "data": <order with populated userId> }`.

**Important errors:** `400` invalid ObjectId; `401` unauthorized; `403` customer token; `404` order missing or not owned by this store.

### `PATCH /store/orders/:orderId/status`

**Purpose:** Advances or cancels an order belonging to this store.

**Request body:**

```json
{ "orderStatus": "packing" }
```

Allowed requested states: `packing`, `out for delivery`, `delivered`, `cancelled`. Actual transitions are restricted:

- `placed` → `packing` or `cancelled`
- `packing` → `out for delivery` or `cancelled`
- `out for delivery` → `delivered`
- `delivered` and `cancelled` are terminal

Moving to `packing` requires a captured payment. Cancelling a paid order through this status endpoint is not supported; use the full-refund endpoint, which immediately cancels the order. An active (`created`) payment transaction prevents cancellation.

**Success — `200 OK`:** `{ "data": <updated order> }`.

**Important errors:** `400` invalid ID/body; `401` unauthorized; `403` customer token; `404` order missing or not owned by this store; `409` illegal transition or cancellation/payment restriction.

### `POST /store/orders/:orderId/refund`

**Purpose:** Immediately cancels an eligible order and requests a full Razorpay refund. The order stays cancelled while Razorpay processes the refund.

**Access:** Authenticated store admin. The order must belong to the store in the token, be paid, and be in `placed` or `packing`. No request body is accepted. Partial refunds are not supported.

**Success — `202 Accepted`:** The order is cancelled and the refund request is pending provider confirmation. Response data contains `orderId`, `refundStatus: "pending"`, and `paymentStatus: "refund_pending"`. The customer is notified of the cancellation and pending refund. Repeating the request returns the existing state and never submits a second Razorpay refund.

**Success — `200 OK`:** Razorpay has already returned a terminal `processed` or `failed` outcome. A processed refund sets `paymentStatus` to `refunded`. A failed refund sets `paymentStatus` to `refund_failed`; the order remains cancelled, and the customer is notified to contact the store.

**Important errors:** `401` unauthorized; `404` order missing or not owned by this store; `409` order is not eligible or payment/refund state is inconsistent; `502` provider response is uncertain or invalid. A `502` can occur after the order has already been cancelled; the local refund remains pending. Do not retry manually; wait for the signed webhook or reconcile with Razorpay.

### `GET /store/transactions`

**Purpose:** Lists payment transactions for orders belonging to this store.

**Query parameters:** Standard pagination; optional `status` (`created`, `paid`, or `failed`); optional `from` and `to` ISO-8601 timestamps, supplied together, to restrict `timestamp` to `[from, to)`.

**Success — `200 OK`:** Paginated transaction data containing fields such as:

```json
{
  "data": [
    {
      "_id": "<transactionId>",
      "orderId": "<orderId>",
      "razorpayOrderId": "order_...",
      "paymentId": "pay_...",
      "amount": 400,
      "status": "paid",
      "refundStatus": "none",
      "refundId": null,
      "timestamp": "<ISO-8601>"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

`amount` is rupees.

**Important errors:** `400` invalid query; `401` unauthorized; `403` customer token.

### `GET /store/transactions/:transactionId`

**Purpose:** Retrieves one transaction only if its associated order belongs to the authenticated store.

**Success — `200 OK`:** `{ "data": <transaction summary> }`, including order ID, Razorpay IDs, amount in rupees, status, and timestamp.

**Important errors:** `400` invalid ObjectId; `401` unauthorized; `403` customer token; `404` transaction missing or associated order belongs to another store.

### `GET /store/reports/export`

**Purpose:** Downloads a store-scoped CSV report for orders or payment transactions. The date range has no maximum duration and is streamed so the complete report is not accumulated in application memory. Delivery addresses and customer contact details are excluded.

**Query parameters:**

- `type`: Required; `orders` or `transactions`.
- `from`, `to`: Required ISO-8601 timestamps; `from` is inclusive and `to` is exclusive.

**Success — `200 OK`:** CSV attachment with `Content-Type: text/csv`. Order columns are `order_id`, `created_at`, `order_status`, `payment_status`, `total_amount`, and `items`. Transaction columns are `timestamp`, `order_id`, `status`, `amount`, `refund_status`, and `refund_id`.

**Important errors:** `400` missing/invalid report type or date bounds; `401` unauthorized; `403` customer token.

## Common errors

API errors normally use this shape:

```json
{ "error": "Human-readable description" }
```

| Status | Typical meaning |
| --- | --- |
| `400 Bad Request` | Invalid request body/query/path parameter, unsupported selection, or malformed JSON. |
| `401 Unauthorized` | Missing/invalid/expired token, invalid OTP, or invalid store credentials. |
| `403 Forbidden` | Token is valid but belongs to the wrong role. |
| `404 Not Found` | Resource is missing or is outside the authenticated account's scope. |
| `409 Conflict` | State transition, inventory, payment, idempotency, or uniqueness conflict. |
| `413 Payload Too Large` | Request body exceeds 1 MB. |
| `429 Too Many Requests` | Authentication rate limit exceeded. |
| `503 Service Unavailable` | Required Twilio, Razorpay, or JWT configuration is missing. |
| `500 Internal Server Error` | Unexpected server-side failure; response does not expose internal details. |

## Suggested customer flow

1. Browse `GET /stores` and `GET /products`.
2. Request an OTP with `POST /auth/users/otp`; verify using `POST /auth/users/verify`.
3. Save the returned JWT and load customer data with `GET /users/me`.
4. Add/select a delivery address and add selections using `POST /cart/items`.
5. Review `GET /cart`; resolve unavailable items before checkout.
6. Start payment with `POST /payments/razorpay/order` using the saved `addressId`, selected `storeId` when needed, and a UUID `idempotencyKey`. This creates a checkout attempt, not an order.
7. Open Razorpay Checkout using the returned `keyId`, `razorpayOrderId`, `amount` (paise), and `currency`.
8. On a failed or dismissed payment, call `POST /payments/razorpay/:razorpayOrderId/failed`; no order is created and cart items remain.
9. On payment success, submit the Razorpay callback to `POST /payments/razorpay/verify`. The backend creates the paid order only after provider verification.
10. Fetch the returned order ID from `GET /orders/:orderId` to display the confirmed order.
