# Nalli Bokka API

Express 5 REST API using MongoDB/Mongoose, Firebase Authentication for customer phone verification, JWT bearer tokens, and Razorpay for payments.

## Setup

Requirements: Node.js 18+, npm, MongoDB, a Firebase project with Phone sign-in enabled, Cloudinary credentials for product image uploads, and Razorpay credentials for live payment flows.

```powershell
npm install
Copy-Item .env.example .env
```

Set `MONGODB_URI`, `JWT_SECRET` (generate a unique random value of at least 32 characters), and `CORS_ORIGIN` in `.env`. `CORS_ORIGIN` accepts a comma-separated list of website origins. In Firebase Console, enable Phone Authentication and create a service-account key; set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` from that key to verify customer sign-in tokens. Store the private key only on the backend and never commit it. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` from your Cloudinary account to enable store product image uploads; keep the API secret only in backend environment settings. Add the Razorpay credentials and webhook secret to enable payments. The server starts only after MongoDB connects and the JWT secret is configured.

```powershell
npm run dev
```

The default base URL is `http://localhost:3000/api`. `npm start` runs without watch mode.

### Payment and refund reconciliation

The signed Razorpay webhook remains the primary payment/refund update mechanism. Razorpay Checkout also uses a signed server callback for browser redirect flows, including mobile UPI app switches. On Render, the callback URL is derived from `RENDER_EXTERNAL_URL`; on other hosts, set `PUBLIC_API_URL` to the public API origin. The callback redirects only to an origin included in `CORS_ORIGIN`. To recover eligible pending records if a webhook is delayed or lost, run this one-shot reconciliation job:

```powershell
npm run reconcile-payments
```

It checks pending checkout attempts, created payment transactions, and pending refunds older than `RECONCILE_MIN_AGE_MINUTES` (default 10) against Razorpay. It never initiates a new payment or refund. Configure the command in your deployment scheduler to run periodically (for example, every 10–15 minutes), and alert on a non-zero exit code or `payment.reconciliation.failed` / `refund.reconciliation.failed` logs. The job requires the same database and Razorpay environment configuration as the API.

Run the automated checks with `npm test`. The purchase integration test starts a temporary MongoDB replica set with `mongodb-memory-server` (the MongoDB binary may be downloaded on its first run) and stubs Razorpay provider calls. Tests do not use application database data or call live Firebase/Razorpay services.

## Provision store/admin accounts

Store registration is deliberately not public. Create store accounts from a trusted terminal; the password prompt is hidden and the password is bcrypt-hashed before saving:

```powershell
npm run create-store
```

The script accepts an optional store phone number. Existing store records need `storePhone` populated in the database before customers can use the order-detail click-to-call action.

## Authentication

- Customer OTP: Firebase sends/verifies SMS codes in the browser; the API verifies the Firebase ID token. Existing customers sign in immediately; first-time customers complete registration with the short-lived verification token and a required name.
- Order invoices: customers and store admins can download a PDF for their own order. The PDF is generated once from the saved order details and stored with that order for consistent future downloads.
- Store login: use the provisioned store `username` and password.
- Authenticated endpoints take `Authorization: Bearer <token>`. Tokens are role-scoped (`user` or `store`) and expire after `JWT_EXPIRES_IN` (default `7d`).
- Firebase enforces phone-SMS quotas; API ID-token verification/registration and store login are rate-limited.

## Console logging

The API writes structured JSON log entries directly to the process console. Each HTTP response is accompanied by a completion log with timestamp, request ID, method, path, status code, and duration; the response carries the same ID in `X-Request-Id`. Startup, database connection, request failures, and server startup failures are also logged. Request and error logs intentionally exclude request bodies, authorization/cookie headers, and query-string values. Production error logs include the error type but omit raw messages and stack traces; development logs include details for debugging. For centralized production log collection, capture stdout and stderr from the Node process.

## Endpoints

All endpoints are under `/api`. Protected endpoints require a bearer token of the indicated role. List endpoints accept `page` (default 1) and `limit` (default 20, maximum 100).

### Health and authentication

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/health` | Public | Liveness check; verifies the HTTP process is responding |
| GET | `/health/ready` | Public | Readiness check; returns 503 when MongoDB is disconnected |
| POST | `/auth/users/verify` | Public | Verify Firebase phone sign-in; body `{ "firebaseIdToken": "<firebase-id-token>" }`; returns a registration token for new users |
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
| GET | `/products/categories` | Public | List built-in and store-created product categories |
| GET | `/products/:id` | Public | Get an in-stock product |
| GET | `/stores` | Public | Browse stores; optional `search` |
| GET | `/stores/:id` | Public | Get public store details |

Weight-based quantities use kilograms (`0.25` means 250 g). Piece selections use whole piece counts and require product `pieceWeightGrams`. Pack selections use a whole pack count plus the exact `selectedPackLabel`. The API calculates prices from current product pricing; clients cannot submit prices.

### Cart and orders

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/cart` | User | Get cart with current prices and calculated total; total is not persisted, and is `null` while any item is unavailable |
| POST | `/cart/items` | User | Add a cart line; body `{ "productId": "<id>", "selectionType": "weight", "selectedQuantity": 0.5 }`; pack additionally requires `selectedPackLabel`. Matching selections increment an existing line |
| POST | `/cart/items/bulk` | User | Add up to 50 selections for one product in a single request; matching selections increment existing lines |
| PATCH | `/cart/items/:itemId` | User | Change a cart line's selection and quantity |
| DELETE | `/cart/items/:itemId` | User | Remove a cart line |
| DELETE | `/cart/items` | User | Clear the cart |
| GET | `/stores/:id/pickup-slots` | Public | List future 30-minute pickup slots for a store and India-local date |
| POST | `/payments/razorpay/order` | User | Start checkout; choose `delivery` with `addressId` or `pickup` with `pickupAt` |
| GET | `/orders` | User | List own orders; optional `orderStatus`, `orderType`, and paired `from`/`to` date bounds |
| GET | `/orders/:orderId` | User | Get own order |
| GET | `/orders/:orderId/invoice` | User | Download a PDF invoice for own order |
| POST | `/orders/:orderId/cancel` | User | Cancel a placed or packing unpaid order |
| POST | `/orders/:orderId/payment` | User | Create/reuse Razorpay order for payment |
| POST | `/payments/razorpay/verify` | User | Verify captured payment; body `{ "razorpayOrderId", "paymentId", "signature" }` |
| POST | `/payments/razorpay/callback` | Razorpay Checkout | Verify a successful redirect payment and return the browser to its order |
| POST | `/payments/razorpay/webhook` | Razorpay | Verify Razorpay webhook signature and update payment/refund |

An order can contain items from one store only. For multi-store carts, specify `storeId` to check out that store's items; other stores' items remain in the cart for subsequent orders. Product names, selected quantities, line prices, and fulfillment details are copied into the order. Delivery orders require a saved address; pickup orders require a future 30-minute slot within that store's daily hours (Asia/Kolkata). Store hours are edited in the dashboard; the separate open/pause control determines whether orders are accepted. Line and order totals are calculated server-side in rupees and rounded to paise. The payment endpoint returns the Razorpay `keyId`, order ID, amount in paise, and currency for the client checkout. Configure the webhook URL in Razorpay as `https://<your-api-host>/api/payments/razorpay/webhook` and configure the same webhook secret in `RAZORPAY_WEBHOOK_SECRET`.

Important notes on idempotency and transactions:

- New checkouts create a temporary `CheckoutAttempt` and Razorpay payment order first; they do not create an `Order` or clear the cart until server-side verification confirms a captured payment. Failed or dismissed checkouts remain outside the orders collection and keep their cart items. The checkout-payment API requires a UUID idempotency key. Order creation, cart cleanup, payment settlement, and notifications are committed in a MongoDB transaction, so MongoDB must run as a replica set (a single-node replica set is acceptable for many test environments).

- Razorpay webhooks are deduplicated and processed idempotently: the server persists webhook event IDs and ignores duplicate deliveries once an event has been processed. This prevents out-of-order or duplicated webhook deliveries from causing inconsistent payment/order state. Ensure the same `RAZORPAY_WEBHOOK_SECRET` is set in the environment and configured in Razorpay.


Delivery statuses follow `placed -> packing -> out for delivery -> delivered`; pickup statuses follow `placed -> packing -> ready for pickup -> picked up`. Unpaid orders can be cancelled while placed or packing. Packing requires confirmed payment. Store admins can issue a full refund for their own paid `placed` or `packing` orders. Fulfillment pauses during refund confirmation; a processed refund cancels the order, while a failed refund leaves it paid and eligible to continue fulfillment.

### Store dashboard and operations

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/store/dashboard` | Store | Inventory counts, order counts by status, rolling paid revenue, optional bounded-period metrics, and latest 10 orders |
| PATCH | `/store/hours` | Store | Save daily pickup opening/closing times in 30-minute increments |
| GET | `/store/product-categories` | Store | List built-in and store-created product categories |
| POST | `/store/product-categories` | Store | Create a store-specific product category |
| GET | `/store/products` | Store | List this store's products; optional category, search, stock, and pricing filters |
| POST | `/store/products` | Store | Create product; `storeId` is taken from the authenticated store |
| PATCH | `/store/products/:productId` | Store | Update own product; schema enforces product pricing rules |
| PATCH | `/store/products/:productId/stock` | Store | Mark own product in/out of stock; body `{ "inStock": false }` |
| DELETE | `/store/products/:productId` | Store | Delete own product |
| GET | `/store/orders` | Store | List only this store's orders; optional `orderStatus`, `orderType`, and paired `from`/`to` date bounds |
| GET | `/store/orders/:orderId` | Store | Get only this store's order |
| GET | `/store/orders/:orderId/invoice` | Store | Download a PDF invoice for an order belonging to this store |
| PATCH | `/store/orders/:orderId/status` | Store | Advance/cancel delivery or pickup order; body `{ "orderStatus": "packing" }` |
| POST | `/store/orders/:orderId/refund` | Store | Request a full refund for an eligible paid order |
| POST | `/store/orders/:orderId/refund` | Store | Request a full refund for an eligible paid order |
| GET | `/store/transactions` | Store | List transactions for this store's orders; optional `status` and paired `from`/`to` date bounds |
| GET | `/store/transactions/:transactionId` | Store | Get a transaction only if it belongs to this store's order |
| GET | `/store/reports/export` | Store | Stream an orders or transactions CSV for required `type`, `from`, and `to` parameters |

Store data access is scoped to the authenticated store ID; clients cannot choose a different `storeId` for inventory or order operations.

### Product image uploads

Store product create and update requests use `multipart/form-data`. Send product fields as JSON in the `productData` field and attach the image as `image` (JPEG, PNG, or WebP, up to 5 MB). Images are uploaded to Cloudinary; product records keep the secure URL and Cloudinary public ID. Updates may omit `image` to keep the current image.

Example `productData` for weight-priced products:

```json
{
  "productType": "meat",
  "productName": "Mutton",
  "pricePerKg": 800,
  "pieceWeightGrams": 250,
  "inStock": true
}
```

Example `productData` for pack-priced products:

```json
{
  "productType": "oil",
  "productName": "Groundnut oil",
  "packs": [
    { "label": "1 L", "price": 220 },
    { "label": "5 L", "price": 1020 }
  ]
}
```

For rice, provide exactly one of `pricePerKg` (loose) or `packs` (packaged). Meat, vegetables, and fruit require `pricePerKg`; oil requires `packs`. `pieceWeightGrams` enables piece-count selection for weight-priced products.

## Collections

Mongoose models are in `src/models/`: `Store`, `User`, `Product`, `Cart`, `Order`, `Transaction`, `IdempotencyKey`, and `WebhookEvent`. Cart totals are never stored. Transactions are the payment record; order documents contain only payment status and order-time product/address snapshots.
