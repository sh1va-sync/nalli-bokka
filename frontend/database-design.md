# Nalli Bokka Database Design

This document describes the MongoDB collections and data relationships used by the Nalli Bokka API. It is written for frontend developers who need to understand what the API's data represents, what can change, and which values should be treated as authoritative.

> **Important:** Frontend applications communicate with the backend API, not directly with MongoDB. The database may contain fields that must never be exposed to a browser (such as password hashes), and the API may populate references or calculate values that are not stored in a collection. Use the endpoint responses and API documentation as the contract.

## 1. Design overview

The application has six core business collections:

1. `stores`
2. `users`
3. `products`
4. `carts`
5. `orders`
6. `transactions`

There are also four supporting collections used for pending checkout attempts, legacy retry records, webhooks, and customer notifications:

7. `checkoutattempts`
8. `idempotencykeys` (legacy)
9. `webhookevents`
10. `notifications`

Checkout attempts hold cart/address snapshots until payment is verified; the other supporting collections track legacy idempotency records, webhook handling, and customer-visible order-status updates.

### Core relationship diagram

```text
Store 1 ───── * Product
Store 1 ───── * Order

User  1 ───── 0..1 Cart
User  1 ───── * Order
User  1 ───── * IdempotencyKey
User  1 ───── * CheckoutAttempt
User  1 ───── * Notification

Cart.items[*] ───── Product
Order.items[*] ───── Product (reference plus order-time snapshot)
Order 1 ───── * Transaction
Order 1 ───── * Notification
CheckoutAttempt.orderId ───── Order (only after verified payment)
IdempotencyKey.orderId ───── Order
WebhookEvent ───── Razorpay webhook event identifier (not an Order reference)
```

`1 ───── *` means the parent can be referenced by many child documents. These relationships are references, not nested arrays on the parent: a Store does not have embedded products or orders; query by `storeId`.

### MongoDB and API representation basics

- MongoDB documents use `_id`; Mongoose serializes ObjectIds as strings in JSON API responses.
- A reference field is stored as an ObjectId and may be populated by selected API endpoints. A populated reference becomes an object in the response; an unpopulated reference remains an ID string.
- Embedded subdocuments (user addresses and cart lines) are stored in their parent's document and generally have their own `_id`.
- Dates are stored as BSON dates and serialized as ISO-8601 strings.
- The API accepts and returns money as JSON numbers in rupees except the Razorpay Checkout `amount`, which is integer paise.
- Mongoose timestamps add `createdAt` and `updatedAt` only where stated for each collection below.
- Collection/index names can be created by Mongoose when the application connects. For production deployments, database index creation should be reviewed as part of deployment/migration operations.

## 2. Store collection — `stores`

Represents a store and its store-admin login identity. It does not contain product/order arrays.

### Fields

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `_id` | ObjectId | Generated | Store identifier. Other records reference this as `storeId`. |
| `storeName` | String | Yes | Display name of the store; trimmed. |
| `username` | String | Yes | Login identifier; trimmed, lowercased, unique. |
| `password` | String | Yes | Bcrypt hash, not plaintext. Password must be at least 8 characters before hashing. Selected out of normal queries and removed during JSON serialization. |
| `location` | String | Yes | Store location text; trimmed. |
| `createdAt` | Date | Generated | Record creation time. |
| `updatedAt` | Date | Generated | Last document save time. |

### Security and API behavior

- The password field is hashed with bcrypt cost 12 in the model save hook.
- Normal queries exclude `password`; JSON serialization explicitly removes it.
- Login must select the password hash internally to compare it, but the login response returns only store ID, name, username, and location.
- Store documents are created through the trusted `npm run create-store` script; public store registration is not available.
- Public store endpoints select only `_id`, `storeName`, and `location`.
- Store-only APIs use the store ID from the signed-in store JWT; the frontend must not send a store ID to choose which store to manage.

### Indexes and uniqueness

- `username`: unique index.

### Example document (illustrative)

```json
{
  "_id": "66a000000000000000000001",
  "storeName": "Nalli Bokka",
  "username": "nalli-hyderabad",
  "password": "$2b$12$<bcrypt-hash>",
  "location": "Hyderabad",
  "createdAt": "2026-01-10T08:00:00.000Z",
  "updatedAt": "2026-01-10T08:00:00.000Z"
}
```

This is a database example only. The password field must never be sent to the frontend.

## 3. User collection — `users`

Represents a customer authenticated by phone OTP. A user document embeds its saved addresses; cart and orders reference the user rather than being embedded in it.

### User fields

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `_id` | ObjectId | Generated | Customer identifier; used as `userId` in cart, order, and idempotency records. |
| `name` | String | Yes | Customer display name; trimmed. |
| `phone` | String | Yes | Unique phone in E.164 format, for example `+15551234567`; OTP login identity. |
| `email` | String | No | Optional email, lowercased and trimmed when stored. Unique when present as a string. |
| `addresses` | Array of embedded documents | No | Saved delivery addresses; defaults to `[]`. Each address has its own `_id`. |
| `createdAt` | Date | Generated | Record creation time. |
| `updatedAt` | Date | Generated | Last document save time. |

### Address subdocument fields

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `_id` | ObjectId | Generated | Address identifier used by address API routes and `POST /payments/razorpay/order` `addressId`. |
| `label` | String | Yes | User-defined label such as `Home` or `Work`; trimmed. |
| `fullAddress` | String | Yes | Detailed delivery address; trimmed. |
| `landmark` | String | No | Landmark text; defaults to an empty string. |
| `pincode` | String | Yes | Six digits, stored as a string so leading zeroes are preserved. |

### Indexes and uniqueness

- `phone`: unique index.
- `email`: unique partial index for documents whose email is stored as a string. The API clears an email by assigning `undefined`, not by persisting an empty string.

### Example document (illustrative)

```json
{
  "_id": "66a000000000000000000010",
  "name": "Asha Rao",
  "phone": "+15551234567",
  "email": "asha@example.com",
  "addresses": [
    {
      "_id": "66a000000000000000000011",
      "label": "Home",
      "fullAddress": "12 Example Road, Hyderabad",
      "landmark": "Near the park",
      "pincode": "500001"
    }
  ],
  "createdAt": "2026-01-10T08:10:00.000Z",
  "updatedAt": "2026-01-10T08:10:00.000Z"
}
```

### Frontend considerations

- Use the embedded address `_id`, not the array index, to update/delete an address or to submit `addressId` at checkout.
- Address data used on an order is copied into the order at checkout. Editing or deleting a saved address later does not rewrite earlier orders.
- The user document has no `cartId` or list of order IDs. Fetch those resources through the cart/order APIs.
- Phone numbers should remain in E.164 form when submitted to OTP routes.

## 4. Product collection — `products`

Represents a store's catalog item. The same collection supports weight-priced goods and individually priced packs.

### Fields

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `_id` | ObjectId | Generated | Product identifier used by catalog, cart, and order lines. |
| `storeId` | ObjectId → Store | Yes | Owning store. Indexed. |
| `productType` | String enum | Yes | `meat`, `vegetable`, `fruit`, `oil`, or `rice`. |
| `productName` | String | Yes | Display name; trimmed. |
| `imageUrl` | String | Yes | Product image URL. API validation only permits HTTP/HTTPS URLs. |
| `inStock` | Boolean | No | Whether the item is currently purchasable; defaults to `true`. |
| `pricePerKg` | Number | Conditional | Nonnegative price in rupees per kilogram, used for weight pricing. |
| `pieceWeightGrams` | Number | No | Positive approximate weight per piece in grams; permits piece-based pricing on meat, vegetable, and fruit. |
| `packs` | Array of embedded pack records | Conditional | Individually priced pack choices for oil or packaged rice; defaults to `[]`. |
| `createdAt` | Date | Generated | Record creation time. |
| `updatedAt` | Date | Generated | Last document save time. |

### Pack subdocument

Pack subdocuments do not have their own `_id`.

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `label` | String | Yes | Customer-facing size/variant, e.g. `1 L`, `5 L`, `5 kg`; trimmed. Must be unique within this product (comparison is case-insensitive in model validation). |
| `price` | Number | Yes | Nonnegative rupee price for one pack. |

### Pricing-mode rules

| Product type | Allowed stored pricing | Meaning |
| --- | --- | --- |
| `meat` | `pricePerKg` required; no packs | Weight is priced from rupees/kg. Can also support pieces if `pieceWeightGrams` is set. |
| `vegetable` | `pricePerKg` required; no packs | Weight is priced from rupees/kg. Can also support pieces if `pieceWeightGrams` is set. |
| `fruit` | `pricePerKg` required; no packs | Weight is priced from rupees/kg. Can also support pieces if `pieceWeightGrams` is set. |
| `oil` | One or more packs; no `pricePerKg` | Each pack has an independent price; pack size should not be used to derive price. |
| `rice` (loose) | `pricePerKg` and no packs | Weight is priced from rupees/kg. |
| `rice` (packaged) | Packs and no `pricePerKg` | Each pack has an independent price. |

`pieceWeightGrams` does not turn a product into a piece-priced-only item; it adds the option to select whole pieces using the corresponding `pricePerKg`.

### Price examples

For a product with `pricePerKg: 800`:

- `weight`, quantity `0.25` kg → ₹200
- `weight`, quantity `0.5` kg → ₹400

If the same product has `pieceWeightGrams: 250`:

- `pieces`, quantity `2` → 2 × (250/1000 kg) × ₹800/kg = ₹400

For a pack-priced oil product where `packs` contains `{ "label": "5 L", "price": 1020 }`:

- `pack`, quantity `1`, label `5 L` → ₹1,020
- `pack`, quantity `2`, label `5 L` → ₹2,040

The API calculates prices from the current product document; a frontend should not persist or submit a trusted price.

### Indexes

- `{ storeId: 1 }` (declared on field).
- `{ storeId: 1, productType: 1 }` (compound index).

### Example documents

Weight-priced meat:

```json
{
  "_id": "66a000000000000000000020",
  "storeId": "66a000000000000000000001",
  "productType": "meat",
  "productName": "Mutton",
  "imageUrl": "https://cdn.example.com/mutton.jpg",
  "inStock": true,
  "pricePerKg": 800,
  "pieceWeightGrams": 250,
  "packs": [],
  "createdAt": "2026-01-10T08:30:00.000Z",
  "updatedAt": "2026-01-10T08:30:00.000Z"
}
```

Pack-priced oil:

```json
{
  "_id": "66a000000000000000000021",
  "storeId": "66a000000000000000000001",
  "productType": "oil",
  "productName": "Groundnut oil",
  "imageUrl": "https://cdn.example.com/oil.jpg",
  "inStock": true,
  "packs": [
    { "label": "1 L", "price": 220 },
    { "label": "5 L", "price": 1020 }
  ],
  "createdAt": "2026-01-10T08:35:00.000Z",
  "updatedAt": "2026-01-10T08:35:00.000Z"
}
```

### Frontend considerations

- Public `GET /products` and `GET /products/:id` return only in-stock products.
- Store `GET /store/products` returns in-stock and out-of-stock items.
- Products may be edited or deleted by their owning store. Cart and product screens should refresh availability/prices before checkout.
- An out-of-stock item remains in the database; store admins can change `inStock` to make it purchasable again.
- API product responses can have `storeId` populated as `{ _id, storeName, location }`; do not assume it is always a bare ID.

## 5. Cart collection — `carts`

A cart stores the current selection for one customer. It has no persisted total because prices may change after a product is added.

### Fields

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `_id` | ObjectId | Generated | Cart document identifier. |
| `userId` | ObjectId → User | Yes | Unique owner; only one cart per user. |
| `items` | Array of embedded cart lines | No | Defaults to empty array. Each cart line gets a generated `_id`. |
| `createdAt` | Date | Generated | Record creation time. |
| `updatedAt` | Date | Generated | Last cart save time. |

### Cart line fields

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `_id` | ObjectId | Generated | Cart line identifier, used as `:itemId` by cart update/delete endpoints. |
| `productId` | ObjectId → Product | Yes | Product selected by the customer. |
| `selectionType` | String enum | Yes | `weight`, `pieces`, or `pack`. |
| `selectedQuantity` | Number | Yes | Positive selection amount; weight is kilograms, pieces/packs must be integers. |
| `selectedPackLabel` | String | Conditional | Required for `pack`; identifies the product pack label. |

There are intentionally no `unitPrice`, `lineTotal`, or cart-total fields stored in MongoDB. These are calculated when the cart is returned:

- Weight: `product.pricePerKg × selectedQuantity`.
- Pieces: `product.pricePerKg × pieceWeightGrams / 1000 × piece count`.
- Pack: matching `pack.price × pack count`.

If the product is deleted, out of stock, or no longer supports its stored selection, the cart read response reports the affected line as unavailable. If any line is unavailable, API `total` is `null`.

### Uniqueness

- `userId`: unique index.

### Example document

```json
{
  "_id": "66a000000000000000000030",
  "userId": "66a000000000000000000010",
  "items": [
    {
      "_id": "66a000000000000000000031",
      "productId": "66a000000000000000000020",
      "selectionType": "weight",
      "selectedQuantity": 0.5
    },
    {
      "_id": "66a000000000000000000032",
      "productId": "66a000000000000000000021",
      "selectionType": "pack",
      "selectedQuantity": 1,
      "selectedPackLabel": "5 L"
    }
  ],
  "createdAt": "2026-01-10T09:00:00.000Z",
  "updatedAt": "2026-01-10T09:05:00.000Z"
}
```

## 6. Order collection — `orders`

An order is a durable checkout record for one customer and one store. It contains snapshots so past orders remain meaningful if a product, price, or saved address changes later.

### Fields

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `_id` | ObjectId | Generated | Order identifier used by order, payment, and store order APIs. |
| `userId` | ObjectId → User | Yes | Customer who placed the order. Indexed. |
| `storeId` | ObjectId → Store | Yes | Store fulfilling the order. Indexed. One order has only one store. |
| `deliveryAddress` | Embedded snapshot | Yes | Copy of selected address at checkout; not a live reference to `User.addresses`. |
| `items` | Array of embedded order lines | Yes | Nonempty array of order-time product/price snapshots. |
| `totalAmount` | Number | Yes | Calculated total in rupees, rounded to two decimal places (paise precision). |
| `orderStatus` | String enum | Yes | Order fulfillment state; defaults to `placed`. |
| `paymentStatus` | String enum | Yes | `pending`, `paid`, `failed`, `refund_pending`, `refunded`, or `refund_failed`; defaults to `pending` for legacy records. New orders are created only after verified payment and have `paymentStatus: "paid"`. |
| `createdAt` | Date | Generated | Order creation time. |
| `updatedAt` | Date | Generated | Last order save time. |

### Delivery address snapshot fields

This embedded subdocument has no own `_id`.

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `label` | String | Yes | Address label copied at checkout. |
| `fullAddress` | String | Yes | Full address copied at checkout. |
| `landmark` | String | No | Landmark copied at checkout; defaults to empty string. |
| `pincode` | String | Yes | Six-digit pincode copied at checkout. |

The current schema does not copy customer name or phone into `deliveryAddress`. Customer details can be populated from `userId` for store operations, while address stays as the checkout-time snapshot.

### Order item snapshot fields

Order item subdocuments have no own `_id`.

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `productId` | ObjectId → Product | Yes | Reference to the catalog product, which may later be deleted. |
| `productName` | String | Yes | Product name copied at checkout; use this for historical order display. |
| `selectionType` | String enum | Yes | `weight`, `pieces`, or `pack`. |
| `quantity` | Number | Yes | Kilograms for weight, whole count for pieces or packs. |
| `packLabel` | String | Conditional | Copied pack size label; required when `selectionType` is `pack`. |
| `price` | Number | Yes | Total rupee price for this entire order line, not unit price. |

`totalAmount` is recalculated from the embedded line `price` values on document validation. Prices are calculated from current catalog values during checkout and thereafter copied; a later product price change does not change the order.

### Status values

`orderStatus`:

- `placed`
- `packing`
- `out for delivery`
- `delivered`
- `cancelled`

`paymentStatus`:

- `pending`
- `paid`
- `failed`
- `refund_pending`
- `refunded`
- `refund_failed`

The order lifecycle is constrained by the API:

```text
placed -> packing -> out for delivery -> delivered
   |          |
   +----------+-> cancelled (only when cancellation rules allow)
```

Packing requires a paid order, or an order whose refund has explicitly failed. Refund-pending orders cannot be fulfilled, cancelled, or charged again. A processed refund sets the payment status to `refunded` and cancels the order; a failed refund sets `refund_failed` and leaves the order paid for fulfillment purposes. A created payment attempt blocks cancellation.

### Indexes

- `userId`: index.
- `storeId`: index.
- `{ storeId: 1, createdAt: -1 }`: store order listing.
- `{ userId: 1, createdAt: -1 }`: customer order listing.

### Example document

```json
{
  "_id": "66a000000000000000000040",
  "userId": "66a000000000000000000010",
  "storeId": "66a000000000000000000001",
  "deliveryAddress": {
    "label": "Home",
    "fullAddress": "12 Example Road, Hyderabad",
    "landmark": "Near the park",
    "pincode": "500001"
  },
  "items": [
    {
      "productId": "66a000000000000000000020",
      "productName": "Mutton",
      "selectionType": "weight",
      "quantity": 0.5,
      "price": 400
    }
  ],
  "totalAmount": 400,
  "orderStatus": "placed",
  "paymentStatus": "paid",
  "createdAt": "2026-01-10T09:15:00.000Z",
  "updatedAt": "2026-01-10T09:15:00.000Z"
}
```

### Frontend considerations

- Treat the order response, not the cart, as the final checkout record.
- For order-history UI, display `items[].productName`, `items[].quantity`, `items[].selectionType`, optional `packLabel`, and `items[].price`; avoid relying on the live Product record for historical names or prices.
- `productId` may refer to a deleted product; the snapshot fields remain available.
- Order APIs may populate `storeId` as a store object. Customer order listings/detail do this; inspect each endpoint's response contract.
- The order has no embedded Transaction object. Load transaction data through store transaction APIs; customers use the payment endpoint and order's `paymentStatus`.

## 7. Transaction collection — `transactions`

Stores payment-provider transaction state for a persisted order. New checkout attempts are stored separately in `checkoutattempts`; a Transaction is created only after payment is captured. Legacy persisted unpaid orders may still have created/failed transactions.

### Fields

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `_id` | ObjectId | Generated | Internal transaction identifier. |
| `orderId` | ObjectId → Order | Yes | Order being paid. Indexed. |
| `razorpayOrderId` | String | Yes | Razorpay order identifier; unique and trimmed. |
| `paymentId` | String | No | Razorpay payment identifier, set after payment; unique when present (sparse unique index). |
| `amount` | Number | Yes | Amount in rupees, copied from the order total. |
| `status` | String enum | Yes | `created`, `paid`, or `failed`; defaults to `created`. |
| `refundStatus` | String enum | Yes | `none`, `pending`, `processed`, or `failed`; defaults to `none`. |
| `refundId` | String | No | Razorpay refund identifier, set when returned by the provider. |
| `refundRequestId` | String | No | Internal request token passed in Razorpay refund notes to correlate signed refund webhooks. |
| `timestamp` | Date | Generated | Last payment activity time; defaults to creation time and is updated on settlement. |

This model does not enable Mongoose `createdAt`/`updatedAt` timestamps. Use `timestamp` as the payment activity time.

### Indexes and constraints

- `orderId`: index.
- `razorpayOrderId`: unique.
- `paymentId`: sparse unique (multiple documents may omit it; present values must be unique).
- Partial unique index `{ orderId: 1, status: 1 }` for documents whose status is `created`, allowing at most one active created transaction per order.
- Compound index `{ timestamp: -1, status: 1 }` supports bounded transaction-history and dashboard-period queries.

### Status interaction

- New checkout payment initialization creates a `CheckoutAttempt`, not a Transaction. A Transaction is written with status `paid` only after capture is verified and the paid order is created.
- Legacy persisted orders may continue to use transactions with `created` or `failed` status; settlement updates their order payment state.
- A store refund request atomically reserves the transaction as `pending` before contacting Razorpay; repeat requests reuse this reservation rather than issuing duplicate refunds.
- Refund initiation cancels the order and creates a customer notification in the same transaction that reserves the full refund; the order remains cancelled while refund processing is pending.
- `refund.processed` atomically marks the transaction processed, sets order payment status to `refunded`, and updates the cancellation notification.
- `refund.failed` marks the transaction failed and order payment status `refund_failed`; the order remains cancelled and the customer is notified to contact the store. An uncertain provider response stays pending until a signed webhook or operational reconciliation resolves it.
- Client verification and webhook processing are intended to update transaction and order together in a MongoDB transaction.

### Example document

```json
{
  "_id": "66a000000000000000000050",
  "orderId": "66a000000000000000000040",
  "razorpayOrderId": "order_example123",
  "paymentId": "pay_example456",
  "amount": 400,
  "status": "paid",
  "timestamp": "2026-01-10T09:17:00.000Z"
}
```

### Currency units

The transaction's stored `amount` is rupees. Razorpay APIs and the frontend Checkout SDK use paise, so the server multiplies by 100 when creating Razorpay orders and returns the paise amount to the client.

## 8. IdempotencyKey collection — `idempotencykeys`

A legacy operational collection used by the retired prepayment order-creation flow. New checkout idempotency keys are stored in `CheckoutAttempt`; this collection remains only for historical records.

### Fields

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `_id` | ObjectId | Generated | Internal identifier. |
| `key` | String | Yes | Client-provided idempotency key. |
| `userId` | ObjectId | Yes | User who owns the key; indexed. |
| `orderId` | ObjectId → Order | No | Successful order associated with the key. |
| `status` | String enum | No | `in_progress`, `done`, or `failed`; defaults to `in_progress`. |
| `createdAt` | Date | Generated | Defaults to current time. |

### Index and behavior

- Unique compound index `{ key: 1, userId: 1 }`: the same key can be used by different users, but not twice by one user.
- Historical records link retry keys to orders; new checkout attempts no longer write this collection.
- The current checkout API uses `CheckoutAttempt` and its Razorpay order ID for payment retries; it does not create an order before payment.
- The schema has a `failed` value, but the checkout flow rolls back the transaction on failure rather than persisting a failed marker.

### Example document

```json
{
  "_id": "66a000000000000000000060",
  "key": "checkout-5a6607d0-2c5c-4597-b31c-7d33e3b4d508",
  "userId": "66a000000000000000000010",
  "orderId": "66a000000000000000000040",
  "status": "done",
  "createdAt": "2026-01-10T09:15:00.000Z"
}
```

## 9. WebhookEvent collection — `webhookevents`

An operational collection intended to remember webhook processing and prevent duplicate processing.

### Fields

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `_id` | ObjectId | Generated | Internal identifier. |
| `razorpayEventId` | String | Yes | Unique identifier from Razorpay's `x-razorpay-event-id` webhook header. |
| `receivedAt` | Date | Generated | Defaults to the time the event is stored. |
| `processed` | Boolean | No | Whether processing completed; defaults to `false`. |
| `processedAt` | Date | No | Set after processing succeeds. |

### Index and implementation caveat

- `razorpayEventId`: unique index.
- The webhook requires and stores Razorpay's event ID header, so different event types for one payment have distinct deduplication records.
- The webhook event is not directly referenced by a Transaction document.
- This is backend-internal data; frontend applications should not query or write it.

### Example document

```json
{
  "_id": "66a000000000000000000070",
  "razorpayEventId": "evt_example456",
  "receivedAt": "2026-01-10T09:17:02.000Z",
  "processed": true,
  "processedAt": "2026-01-10T09:17:02.100Z"
}
```

## 10. Notification collection — `notifications`

Stores in-app customer updates when payment places an order and when a store changes its fulfillment status. Order-placement and fulfillment notifications are persisted in the same transaction as the corresponding order change.

### Fields

| Field | Database type | Required | Description |
| --- | --- | --- | --- |
| `_id` | ObjectId | Generated | Notification identifier. |
| `userId` | ObjectId → User | Yes | Customer who owns the notification. All reads and updates are scoped to this user. |
| `orderId` | ObjectId → Order | Yes | Order whose fulfillment status changed. |
| `orderStatus` | String enum | Yes | New status: `placed`, `packing`, `out for delivery`, `delivered`, or `cancelled`. |
| `title` | String | Yes | Short notification heading. |
| `message` | String | Yes | Customer-facing status explanation. |
| `readAt` | Date or null | No | Null until read; then the time the customer marked it read. |
| `createdAt` | Date | Generated | Notification creation time. |
| `updatedAt` | Date | Generated | Last read-state update time. |

### Indexes and behavior

- `{ userId: 1, createdAt: -1 }` supports a customer's newest-first notification list.
- `{ userId: 1, readAt: 1, createdAt: -1 }` supports unread counts and filtering.
- `{ orderId: 1, orderStatus: 1 }` is unique to prevent duplicate notifications for one order/status transition.
- The customer API exposes paginated list, mark-one-read, and mark-all-read operations; it never accepts a client-supplied `userId`.
- This feature is in-app only; it does not send SMS, WhatsApp, or email.

## 11. Data flow by user action

### Browsing a product

1. Product document is loaded from `products`.
2. Public catalog endpoints filter to `inStock: true`.
3. Store reference may be populated from `stores`.
4. The product record is the current source of truth for price and availability.

### Adding to cart

1. Cart line saves product reference and selection (`selectionType`, `selectedQuantity`, optional pack label).
2. Cart does not save price or totals.
3. Cart read recalculates the selection using the current product fields.
4. If the referenced product disappears or becomes unavailable, the API marks that line unavailable in its response.

### Checking out and paying

1. API resolves the customer, saved address, cart items, and products; it validates availability/selections and calculates current prices.
2. It stores the address, selected items and total in a temporary `CheckoutAttempt`, then creates a Razorpay payment order. No Order is inserted and the Cart is not modified.
3. The frontend opens Razorpay Checkout using the provider order ID and amount in paise.
4. A failed or dismissed attempt is marked failed; it remains outside the `orders` collection and leaves cart lines intact.
5. Only after the provider confirms a captured payment does verification/webhook processing atomically create a paid Order and Transaction, add the placed Notification, link the attempt to the order, and remove matching purchased cart lines.
6. CheckoutAttempt records expire after 24 hours. Razorpay webhooks may finalize a captured payment if the browser callback is unavailable.

## 12. Atomicity and deployment requirements

Checkout payment initialization writes only a CheckoutAttempt; it does not write an Order or modify a Cart. Successful payment settlement creates an Order and Transaction, updates the CheckoutAttempt, removes purchased Cart lines, and creates the placed Notification in one transaction. Failed attempts do not create orders. Store order-status changes update the Order and create its customer Notification together. These operations rely on MongoDB transactions.

MongoDB transactions require a replica set or sharded cluster. A single-node replica set is suitable for local transaction testing; a standalone MongoDB deployment is not. If transactions are unavailable, checkout/payment operations can fail even while read-only endpoints work.

The transaction boundary protects multi-document database changes, but calls to external services such as Razorpay happen outside MongoDB and are not part of a MongoDB transaction.

## 13. What the frontend should treat as authoritative

| Concern | Authoritative source |
| --- | --- |
| Current catalog name/image/stock/price | Current Product API response. |
| Current cart price/total | `GET /cart` response; it is recalculated and may change. |
| Checkout price and purchased product name | Created Order document; values are snapshots. |
| Delivery address for an existing order | Order's `deliveryAddress` snapshot. |
| Current fulfillment state | `orderStatus` returned by order endpoints. |
| Customer-visible order update history | Notification API; the current state remains authoritative from the Order API. |
| Current payment result | `paymentStatus` returned by the order after server verification/refresh. |
| Payment provider transaction data | Transaction collection through authorized backend endpoints; do not access MongoDB directly. |
| Store identity for store operations | Store JWT, not a client-supplied `storeId`. |

Do not:

- Connect a browser directly to MongoDB.
- Send product prices as authoritative checkout values.
- Assume the product still exists because an order has a `productId`.
- Assume an order's `storeId` or customer reference is always populated; populated shape depends on endpoint.
- Expose a store password hash, JWT signing secret, Razorpay secret, or webhook secret.
- Store order/cart arrays inside Store or User documents; those relationships are queried by reference.

## 14. Related documentation

- [API endpoint reference](./api-endpoints.md) — endpoint purpose, required request data, responses, and errors.
- [Server and full API documentation](./documentation.md) — project setup, architecture, endpoint overview, validation, and operational notes.
