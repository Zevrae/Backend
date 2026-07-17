# Zevrae Backend

A complete e-commerce backend (Node.js/Express + MongoDB/Mongoose) built out
from the `products` schema you originally provided. Since only the database
section was included, I designed the rest of the application around it:
auth, users, categories, collections, discounts, cart, orders, payments,
reviews, and demand analytics.

## Stack
- Express (ES Modules — `"type": "module"`)
- Mongoose (MongoDB)
- JWT auth (jsonwebtoken + bcryptjs) with email verification (nodemailer)
- Razorpay payments (razorpay SDK)
- Appwrite Storage for product images (node-appwrite + multer)
- Swagger / OpenAPI 3.0 docs (swagger-jsdoc + swagger-ui-express)
- Docker + PM2 (`ecosystem.config.js`) deployment configs included
- Helmet, CORS, Morgan

## Setup
```bash
npm install
cp .env.example .env   # edit MONGO_URI and JWT_SECRET
npm run dev             # or: npm start
```

Requires a running MongoDB instance (local or Atlas) at the URI in `.env`.
Node 18+ is recommended (native `fetch`, stable ESM support).

## Email verification
New accounts start with `is_email_verified: false` and **cannot log in**
until they verify:

1. `POST /api/auth/register` creates the user and emails a verification link
   pointing at `GET /api/auth/verify-email/:token`.
2. The raw token is only ever emailed — the DB stores a SHA-256 hash of it
   plus an expiry (`EMAIL_VERIFICATION_EXPIRES_HOURS`, default 24h), the
   same pattern you'd use for password-reset tokens.
3. Clicking the link marks the account verified; `POST /api/auth/login` will
   now succeed. Before that, login returns `403`.
4. If the link expires or is lost, `POST /api/auth/resend-verification`
   issues a new one. It always returns the same generic message regardless
   of whether the email exists or is already verified, so it can't be used
   to enumerate registered accounts.

**Sending emails**: `utils/sendEmail.js` uses Nodemailer. If `SMTP_HOST` is
left blank in `.env`, it doesn't fail — it logs the full email (including
the clickable verification link) to the console instead, so you can develop
and test the whole flow without a real mail server. Set `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` to send real emails
(e.g. via Gmail SMTP, SendGrid, Mailgun, SES, etc.).

`API_BASE_URL` controls what host the verification link points to — set it
to your deployed API URL in production.

## Payments (Razorpay)
Chosen as the gateway since it's the standard for Indian merchants; swapping
to Stripe/PayPal later mainly means replacing `utils/razorpay.js` and
`controllers/paymentController.js` — the Order schema's `payment_status` /
`razorpay_*` fields are the only gateway-specific pieces.

Flow:
1. `POST /api/orders` creates the Order, empties the cart, and — if
   `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set — also creates a matching
   Razorpay order (amount = `order.total`, already in paise since `price` is
   stored as an integer smallest-unit value). The response's `payment` object
   (`key_id`, `order_id`, `amount`, `currency`) is exactly what you hand to
   Razorpay Checkout on the frontend.
2. After the customer pays, Razorpay Checkout's success handler gives you
   `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` — send
   those to `POST /api/payments/verify`. The signature is checked with
   `HMAC-SHA256(order_id|payment_id, key_secret)`; on success the order is
   marked `paid` and moved to `processing`.
3. **Also** register `POST /api/payments/webhook` as a webhook URL in the
   Razorpay Dashboard (Settings → Webhooks), and set `RAZORPAY_WEBHOOK_SECRET`
   to the secret shown there. This is the reliable path if the client closes
   the tab before step 2 fires — Razorpay's `X-Razorpay-Signature` header is
   verified against the *raw* request body (captured in `server.js` via
   `express.json({ verify })`) before any order is updated.

If Razorpay env vars are left blank, orders are still created (useful for
cash-on-delivery or testing) — `payment` in the response is just `null`.

## Product images (Appwrite Storage)
`POST /api/products/:id/images` accepts up to 5 files (`multipart/form-data`,
field name `images`, 5MB/JPEG/PNG/WEBP/GIF each) via Multer's in-memory
storage, uploads each straight to an Appwrite Storage bucket
(`node-appwrite`'s `InputFile.fromBuffer`), and appends the resulting public
view URLs to the product's existing `images: [String]` array — no schema
change needed. `DELETE /api/products/:id/images` (`{ imageUrl }`) removes the
URL from the array and best-effort deletes the underlying file from Appwrite.

Setup: create a bucket in your Appwrite project, generate a server API key
with Storage read/write scopes, and set `APPWRITE_ENDPOINT`,
`APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_BUCKET_ID` in `.env`.
Uploaded files are given `Permission.read(Role.any())` so the view URLs work
in a public product catalog without an Appwrite session. If these env vars
are left blank, the upload endpoint returns `503` rather than crashing the
app — everything else keeps working.

## API documentation
Once the server is running:
- Interactive Swagger UI: `http://localhost:5000/api-docs`
- Raw OpenAPI JSON: `http://localhost:5000/api-docs.json`

All routes are documented via JSDoc `@swagger` comments directly above each
route in `routes/*.js`; the spec is assembled in `config/swagger.js`. To
authorize requests in the UI, click **Authorize** and paste a JWT obtained
from `POST /api/auth/login`.

## Modules

### Auth (`/api/auth`)
| Method | Route                     | Access  | Description                                    |
|--------|----------------------------|---------|--------------------------------------------------|
| POST   | `/register`                | Public  | Create an account (starts **unverified**)       |
| GET    | `/verify-email/:token`     | Public  | Verify email via the link sent on registration  |
| POST   | `/resend-verification`     | Public  | Resend the verification email (`{ email }`)     |
| POST   | `/login`                   | Public  | Get a JWT — fails with 403 if unverified         |
| GET    | `/me`                      | Private | Current user profile                             |

### Users (`/api/users`)
| Method | Route     | Access       | Description            |
|--------|-----------|--------------|--------------------------|
| PUT    | `/me`     | Private      | Update own profile      |
| GET    | `/`       | Admin        | List users (paginated)  |
| GET    | `/:id`    | Admin        | Get a user               |
| DELETE | `/:id`    | Admin        | Soft-delete a user       |

### Products (`/api/products`) — your original schema
| Method | Route              | Access  | Description                        |
|--------|---------------------|---------|-------------------------------------|
| GET    | `/`                  | Public  | List (paginate/filter/search/sort) |
| POST   | `/`                  | Admin   | Create                              |
| GET    | `/:id`               | Public  | Get one                             |
| PUT    | `/:id`               | Admin   | Update                              |
| DELETE | `/:id`               | Admin   | Soft-delete                         |
| PATCH  | `/:id/restore`       | Admin   | Restore                             |
| POST   | `/:id/images`        | Admin   | Upload product image(s) to Appwrite Storage (multipart `images` field, up to 5) |
| DELETE | `/:id/images`        | Admin   | Remove an image (`{ imageUrl }`) — also deletes it from Appwrite |

Query params for listing: `page, limit, category, subcategory, status, search, sort`

### Categories (`/api/categories`)
Standard CRUD, `GET` public, write ops admin-only. Supports a self-referencing
`parent` field for subcategories, and `slug` is auto-generated from `name`.

### Cart (`/api/cart`) — private, per logged-in user
| Method | Route            | Description             |
|--------|-------------------|--------------------------|
| GET    | `/`                | Get current cart         |
| DELETE | `/`                | Clear cart                |
| POST   | `/items`           | Add item (`productId, size, quantity`) |
| PUT    | `/items/:itemId`   | Update quantity           |
| DELETE | `/items/:itemId`   | Remove item                |

### Orders (`/api/orders`) — private
| Method | Route            | Access  | Description                          |
|--------|-------------------|---------|----------------------------------------|
| POST   | `/`                | Private | Checkout — creates the order (optionally applying a `discount_code`), empties the cart, bumps each item's demand counter, and (if Razorpay is configured) opens a Razorpay order, returning its `payment` details for Checkout |
| GET    | `/`                | Private | List own orders (admin sees all)      |
| GET    | `/:id`             | Owner/Admin | Get one order                     |
| PATCH  | `/:id/status`      | Admin   | Update `order_status` / `payment_status` |

### Payments (`/api/payments`) — Razorpay
| Method | Route            | Access  | Description                          |
|--------|-------------------|---------|----------------------------------------|
| POST   | `/verify`          | Private | Verify a Checkout payment's signature, mark the order paid |
| POST   | `/webhook`         | Public* | Razorpay webhook — verified via `X-Razorpay-Signature`, updates orders on `payment.captured`/`payment.failed` |

\* Not meant to be called by API consumers directly — register this URL in
the Razorpay Dashboard under Webhooks instead.

### Reviews
| Method | Route                                  | Access  | Description               |
|--------|------------------------------------------|---------|-----------------------------|
| GET    | `/api/products/:productId/reviews`       | Public  | List reviews + average rating |
| POST   | `/api/products/:productId/reviews`       | Private | Create a review (one per user per product) |
| PUT    | `/api/reviews/:id`                       | Owner   | Update own review           |
| DELETE | `/api/reviews/:id`                       | Owner/Admin | Soft-delete a review     |

### Collections (`/api/collections`)
Curated groupings of products (e.g. "New Arrivals"), separate from
category/subcategory. A product can belong to multiple collections via its
`collections: [ObjectId]` field.

| Method | Route            | Access  | Description                          |
|--------|-------------------|---------|----------------------------------------|
| GET    | `/`                | Public  | List collections (filter by `status`, `featured`) |
| POST   | `/`                | Admin   | Create (slug auto-generated from name) |
| GET    | `/:slug`           | Public  | Get one by slug                       |
| PUT    | `/:id`             | Admin   | Update                                |
| DELETE | `/:id`             | Admin   | Soft-delete                           |

### Discounts (`/api/discounts`)
Coupon codes with a percentage or fixed-amount value and a usage limit.
Codes are stored uppercase so lookups are case-insensitive.

| Method | Route            | Access  | Description                          |
|--------|-------------------|---------|----------------------------------------|
| GET    | `/`                | Admin   | List all discounts                    |
| POST   | `/`                | Admin   | Create a discount                     |
| GET    | `/:code`           | Public  | Look up a code's details (cart preview) |
| PUT    | `/:id`             | Admin   | Update                                |
| DELETE | `/:id`             | Admin   | Soft-delete                           |
| POST   | `/use`             | Private | Validate a code against a subtotal and consume one use |

`POST /api/orders` accepts an optional `discount_code` and runs the exact
same validation (`utils/discounts.js`) at checkout, so `/discounts/use` and
checkout can never disagree about whether a code is valid.

### Virtual Try-On (`/api/tryon`) — private
Sends a photo of the user plus a product's garment photo to an external
try-on microservice and saves the resulting composited image against the
current user and product.

| Method | Route  | Access  | Description                                    |
|--------|--------|---------|--------------------------------------------------|
| GET    | `/`     | Private | List the current user's try-on history           |
| POST   | `/`     | Private | Generate a try-on (`multipart/form-data`: `productId`, `person_image`, `cloth_image`) |

Requires `TRYON_SERVICE_URL` in `.env` (base URL of the microservice; the
route calls `${TRYON_SERVICE_URL}/api/v1/tryon`). If it's left blank, `POST
/api/tryon` returns `503` rather than crashing the app — same pattern as
Razorpay/Appwrite. Images are received via Multer's in-memory storage (not
written to disk) and streamed straight through to the microservice, so
there's nothing to clean up afterwards and it works unmodified under PM2
cluster mode. The result is always saved against `req.user`, never a
client-supplied user id.

### Analysis (`/api/analysis`) — admin only
Per-product "demand counter", incremented automatically by the quantity
ordered whenever a checkout completes (see `orderController.createOrder`).
If a product's counter crosses `DEMAND_ALERT_THRESHOLD` (default 50), the
customer who just ordered it gets a "possible delay due to high demand"
email — this never blocks or fails the checkout response if it errors.

| Method | Route  | Access | Description                                    |
|--------|--------|--------|--------------------------------------------------|
| GET    | `/`     | Admin  | List demand analytics, sorted by demand descending |
| PUT    | `/`     | Admin  | Manually adjust a product's counter (`{ productId, incrementBy }`) — for corrections/testing; normal updates happen automatically at checkout |

## Design notes & assumptions
- **Auth**: JWT bearer tokens (`Authorization: Bearer <token>`), roles are
  `customer` / `admin`. Product/category writes require `admin`.
- **Soft delete**: every collection has `is_deleted` + `deleted_at`, excluded
  from normal queries automatically; pass `{ withDeleted: true }` as a query
  option to include deleted docs.
- **Timestamps**: mapped to `created_at` / `updated_at` everywhere, matching
  your original field naming.
- **Relationships**: `Order.user`, `Cart.user`, `Review.product`/`user`,
  `Category.parent` are all ObjectId refs. Cart/Order items snapshot the
  product's `name`/`price` at time of add so historical orders aren't
  affected by later price changes.
- **Shipping fee**: placeholder flat value in `orderController.js` — wire up
  real shipping/tax logic there when ready.
- **Product `status` enum**: `active | inactive | draft | archived` — your
  original schema only specified `bsonType: "string"`, so adjust this list
  in `models/Product.js` if your real values differ.
- **Email verification**: accounts must verify their email before logging
  in (see the dedicated section above). Protected routes also re-check
  `is_email_verified` on every request as defense in depth.
- **Payments**: Razorpay is now integrated (see the dedicated section
  above) — order creation, client-side verification, and a signature-checked
  webhook. Swap gateways by replacing `utils/razorpay.js` +
  `controllers/paymentController.js`.
- **Product images**: stored in Appwrite Storage (see the dedicated section
  above); the `images` field itself is still the plain `[String]` of URLs
  from your original schema, so nothing downstream needs to change.
- **Product `collections`**: an array of Collection ObjectIds (a product can
  be in more than one collection). Deliberately *not* named `collection` —
  that's a reserved property name on Mongoose documents and using it as a
  schema field caused warnings and could silently break in subtle ways.
- **Discount usage tracking isn't transactional**: applying a code at
  checkout consumes a use immediately; if Razorpay order creation then
  fails, that use isn't automatically refunded (no multi-document
  transaction, since that needs a Mongo replica set). Worth revisiting if
  it becomes a real support issue — flagged with a comment in
  `orderController.js`.

## Deployment
- **Docker**: `docker build -t zevrae-backend . && docker run -p 5000:5000 --env-file .env zevrae-backend`
- **PM2**: `pm2 start ecosystem.config.js` runs the app in cluster mode
  across all CPU cores with auto-restart; logs go to `./logs/`.

## Bugs fixed in this pass (Virtual Try-On)
A `tryon` module (model/controller/routes, wired into `server.js`) had been
added on top of the otherwise-solid core and shipped broken and insecure.
Fixed:
- `models/Tryon.js` imported `{ schema, model }` from `mongoose` — not real
  exports (mongoose's default export has `Schema`/`model`, not a lowercase
  `schema`) — so the model couldn't load and any route touching it would
  crash the process. Rewritten using the same `mongoose.Schema` pattern as
  every other model, with proper `ObjectId` refs (`user`/`product`) to
  `User`/`Product` instead of untyped `String` fields.
- `routes/tryonRoutes.js` had **no authentication** — anyone could call
  `POST /api/tryon` and, since the controller trusted a client-supplied
  `userId` from the request body, save try-on records under *any* user's
  id. Now requires `protect`, and the saved record always uses
  `req.user._id`.
- The route used `multer({ dest: 'uploads/' })` (disk storage) to a
  directory that didn't exist anywhere in the repo — the first upload would
  throw `ENOENT` and 500. It also left orphaned temp files on disk with no
  cleanup, which additionally breaks under the PM2 cluster config (each
  worker process has its own filesystem view of temp state). Switched to
  the same in-memory Multer storage already used for product images, and
  the controller now streams the buffers straight to the try-on
  microservice.
- `TRYON_SERVICE_URL`, which the controller depends on, wasn't in
  `.env.example` and there was no handling for it being unset — the request
  would throw partway through instead of failing cleanly. Added to
  `.env.example` and the controller now returns `503` up front if it's
  missing, matching the Razorpay/Appwrite "not configured" pattern.
- No product-existence check — a nonexistent `productId` would silently
  create a `Tryon` record instead of returning `404`.
- No Swagger documentation and no way to list a user's own try-on history;
  added both (`GET /api/tryon`) plus a `Tryon` schema in `config/swagger.js`.

## Other fixes in this pass
- `server.js` disabled Helmet's Content-Security-Policy **globally** while
  a comment claimed it was only relaxed "for /api-docs" — the CSP was
  actually off for every route in the app. Scoped the relaxed policy to
  just the `/api-docs` routes; the rest of the app now runs under Helmet's
  full defaults.

## Bugs fixed in an earlier pass (Analysis/Collections/Discounts)
This project was uploaded with a partially-finished Analysis/Collections/
Discounts feature set layered on top of the working core. Fixed:
- `models/Analysis.js` imported `{ schema, model }` from `mongoose` (not
  real exports) and used `Schema`/`Model` inconsistently — the file
  couldn't load at all.
- `controllers/analysisController.js` imported from a model file that
  didn't exist (`models/analysisModel.js` vs the real `models/Analysis.js`),
  imported `sendEmail` as a default export when it's a named export, called
  `findByIdAndUpdate(productId, ...)` which updates by the *Analysis
  document's* `_id` rather than its `productId` field (so it silently did
  nothing for real product ids), and emailed `User.email` — `User` is the
  Mongoose *model*, not a specific user, so that was always `undefined`.
- `routes/analysisRoutes.js`, `routes/collectionRoutes.js`, and
  `routes/discountRoutes.js` had **no authentication at all** on admin
  write operations — anyone could create unlimited-use 100%-off discount
  codes or delete collections with a plain unauthenticated request. All
  three now require `protect` + `authorize('admin')` where appropriate.
- `discountController.useDiscount` referenced `discount.usageLimit`, a
  field that doesn't exist on the schema (the real field is the nested
  `usage.limit`/`usage.used`) — so usage limits, expiry, and active-status
  were never actually enforced. Rewrote it (and factored the logic into
  `utils/discounts.js` so checkout uses the identical validation).
- `models/Product.js` had a field literally named `collection`, which is a
  reserved property on Mongoose documents — renamed to `collections`
  (an array of Collection refs, which also actually connects Product to
  the new Collection model — previously they weren't linked at all).
- `Dockerfile` and `ecosystem.config.js` existed but were completely empty.
- The Discounts and Collections features existed as CRUD but weren't wired
  into anything: checkout couldn't apply a coupon, and Products had no
  working relationship to Collections. Both are now integrated (see the
  Discounts and Collections sections above).
- None of the three new route files had Swagger documentation — added,
  consistent with the rest of the API.

## Verification performed
- Every file syntax-checks under Node's ESM parser (`node --check`).
- Every module/route/controller was `import`-loaded successfully (42 files,
  zero failures — including the previously-broken Analysis model/controller).
- The generated OpenAPI spec was inspected directly: **32 documented paths**
  across all 11 modules, 23 reusable schemas.
- The real Express app (routes, middleware, Swagger UI) was booted and hit
  over HTTP: `/health` → 200, `/api-docs.json` → 200 with the full path list,
  `/api-docs` → 200 serving the Swagger UI HTML, a 404 handler works, and a
  DB-backed route correctly reaches Mongoose (fails with 500 only because no
  MongoDB is reachable in this sandbox).
- **Confirmed the security fix directly**: booted the app and sent
  unauthenticated `POST /api/collections`, `POST /api/discounts`,
  `DELETE /api/discounts/:id`, and `GET /api/analysis` — all now correctly
  return 401 (previously would have succeeded with zero auth).
- **Discount model logic** tested directly: code normalized to uppercase,
  `isRedeemable()` correctly flips to `false` once `usage.used` hits
  `usage.limit` or `expiry` passes, `calculateDiscountAmount()` computes
  the right percentage, and a >100% percentage value is correctly rejected
  by schema validation.
- **Razorpay**: the actual SDK was installed and inspected to confirm its
  real API surface (`orders.create`, and that `validatePaymentVerification`
  is *not* a public static method — only `validateWebhookSignature` is, so
  payment-signature checking is done with the documented HMAC formula
  directly). Verified with real `crypto` HMAC computations that a correct
  signature is accepted and a tampered one is rejected, for both the
  Checkout verification flow and the webhook flow — then confirmed over
  HTTP that a forged `X-Razorpay-Signature` is rejected with 400 and a
  correctly signed one passes signature checking and proceeds to the DB
  lookup.
- **Appwrite**: `node-appwrite` (v27) was installed and its type
  definitions inspected to confirm the current object-style `createFile()`
  API and that `InputFile` must be imported from `node-appwrite/file`.
  Verified the public view-URL builder and the file-id-from-URL extractor
  against real Appwrite URL formats, and constructed a real `InputFile`
  from a buffer to confirm it works. Confirmed over HTTP that an
  unauthenticated multipart upload is correctly blocked with 401 before
  ever reaching Multer or Appwrite.

A full live-DB integration test wasn't possible here (MongoDB binary
downloads are network-restricted in this sandbox), so **test the auth →
verify → login → checkout (with and without a discount code) → pay →
upload-image flow end-to-end against a real MongoDB, Razorpay test account,
and Appwrite project before deploying**.
