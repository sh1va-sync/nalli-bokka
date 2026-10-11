# Nalli Bokka storefront

Customer storefront for ordering groceries, fresh produce, rice, oils and meat from a selected Nalli Bokka store. Built with React, Redux Toolkit/RTK Query, React Router and Tailwind CSS.

## Run locally

1. Start the API server on `http://localhost:3000`.
2. Copy `.env.example` to `.env`. The local `/api` proxy forwards requests to port `3000` without browser CORS; set `VITE_API_BASE_URL` to the server's absolute `/api` URL when the API is hosted separately. A separately hosted API must allow the deployed frontend origin for authenticated cross-origin requests.
3. Install dependencies with `npm install`.
4. Start Vite with `npm run dev`.

Razorpay Checkout uses its hosted browser SDK. Its public key comes from the payment-order API; no Razorpay secret belongs in this application.

## Stage-one customer features

- Choose and persist a store; browse its available products.
- Search with a short debounce, filter by product type, sort, and paginate through the catalog.
- Use a guest basket before signing in; selections persist locally and are synchronized to the server cart after OTP login.
- Sign in or create a customer account with phone OTP; first-time customers enter a name after OTP verification (email is optional) using the backend registration-token flow.
- Manage customer profile details and saved delivery addresses.
- Refresh authoritative cart prices, add/select an address without leaving checkout, create a one-store order, and pay by UPI through Razorpay with server-side payment verification.
- Review order history and poll current order status while tracking; see store status changes in the in-app notification center.

## Checkout payment follow-up

Checkout currently supports UPI through the Razorpay payment endpoints. Cash on delivery is shown as a disabled “Coming soon” option until the backend supports it.

When COD is implemented server-side, update the API contract and checkout flow together:

1. Define how the selected payment method is sent with order creation (for example, a `paymentMethod` value) and validate it on the server.
2. Define COD order/payment status transitions and ensure COD orders do not create Razorpay payment sessions.
3. Enable the COD option in `src/features/customer/pages/CheckoutPage.jsx`, send the backend-defined value, and show an appropriate order confirmation instead of launching Razorpay.
4. Update order history/tracking labels and the API examples in `backend-api-endpoints.md` and `database-design.md`.

## Store dashboard

- Open the store portal at `/store/login`; authenticate with the username/password provisioned by the backend. Store credentials and JWT are kept separate from customer authentication.
- Dashboard overview, orders, inventory, and transaction screens use the `/store/*` APIs and are isolated in `src/features/storeAdmin`.
- Use the shared date selector on the overview, orders, or transactions screen to review a specific local calendar day; the same selection filters daily metrics, orders, and transactions. Daily order and transaction metrics use server-side aggregates bounded by local midnight timestamps from the browser, so counts and totals are not limited to the first page. Store inventory, selected-day orders, and selected-day transactions provide next/previous pagination. The dashboard refreshes live order data periodically. Accepting an order moves it to `packing`, which the API permits only after payment is marked paid; decline requests the API's `cancelled` transition.
- Download the selected day's orders or payment transactions as a store-scoped CSV. The API also accepts longer date ranges and streams exports without including customer contact details or delivery addresses.
- Request a full refund for a paid order while it is `placed` or `packing`. Fulfillment pauses during provider confirmation; processed refunds cancel the order and notify the customer, while failed refunds leave the paid order eligible to continue.
- Inventory supports the product types currently accepted by the API (`meat`, `vegetable`, `fruit`, `oil`, `rice`), adding/editing weight-priced or pack-priced products, stock toggles, and deletion. Arbitrary new categories are not supported by the current product schema.

Backend follow-ups before completing store operations:

1. Add a store open/close endpoint and availability field; the dashboard currently shows the control as unavailable rather than pretending it changed store state.
2. Expand product category validation and product/customer filtering if stores need custom categories beyond the five current enum values.
Catalog errors and API validation errors are shown in the interface. The API remains authoritative for availability, prices, checkout totals, order state and payment state.
For endpoint payloads and data relationships, see [backend-api-endpoints.md](./backend-api-endpoints.md) and [database-design.md](./database-design.md).

## Code organization

- `src/app` — Redux store setup.
- `src/features/api` — RTK Query API and cache invalidation.
- `src/features/auth`, `src/features/cart`, `src/features/store` — shared state for authentication, guest selections and active store.
- `src/features/customer` — customer pages and reusable storefront components.
- Future store-admin and superadmin dashboards should use separate feature folders when their API contracts are available. No admin routes are exposed in this customer stage.

The frontend talks only to the HTTP API. It never connects to MongoDB or stores secret credentials.
