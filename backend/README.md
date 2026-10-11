# Nalli Bokka API

Express 5 REST API using MongoDB/Mongoose, Twilio Verify for customer phone authentication, JWT bearer tokens, and Razorpay for payments.

## Setup

Requirements: Node.js 18+, npm, MongoDB, a Twilio Verify service, and Razorpay credentials for live payment flows.

```powershell
npm install
Copy-Item .env.example .env
```

Set `MONGODB_URI`, `JWT_SECRET` (generate a unique random value of at least 32 characters), and `CORS_ORIGIN` in `.env`. `CORS_ORIGIN` accepts a comma-separated list of website origins. Add the Twilio Verify credentials to enable phone OTP, and the Razorpay credentials and webhook secret to enable payments. The server starts only after MongoDB connects and the JWT secret is configured.

```powershell
npm run dev
```

The default base URL is `http://localhost:3000/api`. `npm start` runs without watch mode.

Run the automated checks with `npm test`. The purchase integration test starts a temporary MongoDB replica set with `mongodb-memory-server` (the MongoDB binary may be downloaded on its first run) and stubs Razorpay provider calls. It does not use application database data or call live Twilio/Razorpay services.

## Provision store/admin accounts

Store registration is deliberately not public. Create store accounts from a trusted terminal; the password prompt is hidden and the password is bcrypt-hashed before saving:

```powershell
npm run create-store
```

## Authentication

- Customer OTP: request a code, then verify it. Existing customers sign in immediately; first-time customers complete registration with the short-lived verification token and a required name.
- Store login: use the provisioned store `username` and password.
- Authenticated endpoints take `Authorization: Bearer <token>`. Tokens are role-scoped (`user` or `store`) and expire after `JWT_EXPIRES_IN` (default `7d`).
- OTP request/verification and store login are rate-limited.

## Console logging

The API writes structured JSON log entries directly to the process console. Each HTTP response is accompanied by a completion log with timestamp, request ID, method, path, status code, and duration; the response carries the same ID in `X-Request-Id`. Startup, database connection, request failures, and server startup failures are also logged. Request and error logs intentionally exclude request bodies, authorization/cookie headers, and query-string values so OTPs, payment data, and credentials are not copied to console output. For centralized production log collection, capture stdout and stderr from the Node process.

## Endpoints

All endpoints are under `/api`. Protected endpoints require a bearer token of the indicated role. List endpoints accept `page` (default 1) and `limit` (default 20, maximum 100).

### Health and authentication

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/health` | Public | Liveness check; verifies the HTTP process is responding |
| GET | `/health/ready` | Public | Readiness check; returns 503 when MongoDB is disconnected |
| POST | `/auth/users/otp` | Public | Send SMS verification code; body `{ "phone": "+15551234567" }` (E.164) |
| POST | `/auth/users/verify` | Public | Verify OTP; body `{ "phone": "+15551234567", "code": "123456" }`; returns a registration token for new users |
| POST | `/auth/users/register` | Public + registration token | Create a new customer account with `name` and optional `email` |
| POST | `/auth/stores/login` | Public | Store login; body `{ "username": "shop", "password": "..." }` |
| GET | `/auth/me` | User or store | Get current authenticated account |

### Customer account and catalog

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/users/me` | User | Get profile and saved addresses |
| PATCH | `/users/me` | User | Update `name` and/or `email` |
| POST | `/users/me/addresses` | User | Add address `{ "label", "fullAddress", "landmark", "pincode" }` |
| PATCH | `/users/me/addresses/:addressId` | User | Update saved address |
| DELETE | `/users/me/addresses/:addressId` | User | Delete saved address |
| GET | `/users/me/notifications` | User | List order-status notifications and unread count |
| PATCH | `/users/me/notifications/:notificationId/read` | User | Mark one notification as read |
| PATCH | `/users/me/notifications/read-all` | User | Mark all notifications as read |
| GET | `/products` | Public | Browse in-stock products; filters: `storeId`, `productType`, `search` |
| GET | `/products/:id` | Public | Get an in-stock product |
| GET | `/stores` | Public | Browse stores; optional `search` |
| GET | `/stores/:id` | Public | Get public store details |

Weight-based quantities use kilograms (`0.25` means 250 g). Piece selections use whole piece counts and require product `pieceWeightGrams`. Pack selections use a whole pack count plus the exact `selectedPackLabel`. The API calculates prices from current product pricing; clients cannot submit prices.

### Cart and orders

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/cart` | User | Get cart with current prices and calculated total; total is not persisted, and is `null` while any item is unavailable |
| POST | `/cart/items` | User | Add a cart line; body `{ "productId": "<id>", "selectionType": "weight", "selectedQuantity": 0.5 }`; pack additionally requires `selectedPackLabel`. Matching selections increment an existing line |
| PATCH | `/cart/items/:itemId` | User | Change a cart line's selection and quantity |
| DELETE | `/cart/items/:itemId` | User | Remove a cart line |
| POST | `/orders` | User | Place one store's cart items; body `{ "addressId": "<saved address id>", "storeId": "<store id>" }`; omit `storeId` if the cart contains a single store |
| GET | `/orders` | User | List own orders; optional `orderStatus` and paired `from`/`to` date bounds |
| GET | `/orders/:orderId` | User | Get own order |
| POST | `/orders/:orderId/cancel` | User | Cancel a placed or packing unpaid order |
| POST | `/orders/:orderId/payment` | User | Create/reuse Razorpay order for payment |
| POST | `/payments/razorpay/verify` | User | Verify captured payment; body `{ "razorpayOrderId", "paymentId", "signature" }` |
| POST | `/payments/razorpay/webhook` | Razorpay | Verify Razorpay webhook signature and update payment/refund |

An order can contain items from one store only. For multi-store carts, specify `storeId` to check out that store's items; other stores' items remain in the cart for subsequent orders. Product names, selected quantities, line prices, and delivery address are copied into the order. Line and order totals are calculated server-side in rupees and rounded to paise. The payment endpoint returns the Razorpay `keyId`, order ID, amount in paise, and currency for the client checkout. Configure the webhook URL in Razorpay as `https://<your-api-host>/api/payments/razorpay/webhook` and configure the same webhook secret in `RAZORPAY_WEBHOOK_SECRET`.

Important notes on idempotency and transactions:

- Checkout requests may be retried by clients. To make checkouts atomic and retry-safe the API accepts an `Idempotency-Key` header on `POST /api/orders`. When provided, the server will ensure the same idempotency key + user pair results in a single order (the request will return the previously created order if it already succeeded). Checkout, payment settlement, and store order-status/notification updates use MongoDB transactions — this requires the MongoDB deployment to run as a replica set (a single-node replica set is acceptable for many test environments).

- Razorpay webhooks are deduplicated and processed idempotently: the server persists webhook event IDs and ignores duplicate deliveries once an event has been processed. This prevents out-of-order or duplicated webhook deliveries from causing inconsistent payment/order state. Ensure the same `RAZORPAY_WEBHOOK_SECRET` is set in the environment and configured in Razorpay.


Order statuses follow `placed -> packing -> out for delivery -> delivered`; unpaid orders can be cancelled while placed or packing. Packing requires confirmed payment. Store admins can issue a full refund for their own paid `placed` or `packing` orders. Fulfillment pauses during refund confirmation; a processed refund cancels the order, while a failed refund leaves it paid and eligible to continue fulfillment.

### Store dashboard and operations

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/store/dashboard` | Store | Inventory counts, order counts by status, rolling paid revenue, optional bounded-period metrics, and latest 10 orders |
| GET | `/store/products` | Store | List this store's products; optional `productType`, `search` |
| POST | `/store/products` | Store | Create product; `storeId` is taken from the authenticated store |
| PATCH | `/store/products/:productId` | Store | Update own product; schema enforces product pricing rules |
| PATCH | `/store/products/:productId/stock` | Store | Mark own product in/out of stock; body `{ "inStock": false }` |
| DELETE | `/store/products/:productId` | Store | Delete own product |
| GET | `/store/orders` | Store | List only this store's orders; optional `orderStatus` and paired `from`/`to` date bounds |
| GET | `/store/orders/:orderId` | Store | Get only this store's order |
| PATCH | `/store/orders/:orderId/status` | Store | Advance/cancel order; body `{ "orderStatus": "packing" }` |
| POST | `/store/orders/:orderId/refund` | Store | Request a full refund for an eligible paid order |
| POST | `/store/orders/:orderId/refund` | Store | Request a full refund for an eligible paid order |
| GET | `/store/transactions` | Store | List transactions for this store's orders; optional `status` and paired `from`/`to` date bounds |
| GET | `/store/transactions/:transactionId` | Store | Get a transaction only if it belongs to this store's order |
| GET | `/store/reports/export` | Store | Stream an orders or transactions CSV for required `type`, `from`, and `to` parameters |

Store data access is scoped to the authenticated store ID; clients cannot choose a different `storeId` for inventory or order operations.

### Product create examples

Create weight-priced mutton/vegetables/fruit, or loose rice:

```json
{
  "productType": "meat",
  "productName": "Mutton",
  "imageUrl": "https://cdn.example.com/mutton.jpg",
  "pricePerKg": 800,
  "pieceWeightGrams": 250,
  "inStock": true
}
```

Create oil or packaged rice with individually priced packs:

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

For rice, provide exactly one of `pricePerKg` (loose) or `packs` (packaged). Meat, vegetables, and fruit require `pricePerKg`; oil requires `packs`. `pieceWeightGrams` enables piece-count selection for weight-priced products.

## Collections

Mongoose models are in `src/models/`: `Store`, `User`, `Product`, `Cart`, `Order`, `Transaction`, `IdempotencyKey`, and `WebhookEvent`. Cart totals are never stored. Transactions are the payment record; order documents contain only payment status and order-time product/address snapshots.
