# Zevrae Backend

A complete e-commerce backend (Node.js/Express + MongoDB/Mongoose) built out
from the `products` schema you originally provided. Since only the database
section was included, I designed the rest of the application around it:
auth, users, categories, cart, orders, and reviews.

## Stack
- Express (ES Modules — `"type": "module"`)
- Mongoose (MongoDB)
- JWT auth (jsonwebtoken + bcryptjs) with email verification (nodemailer)
- Razorpay payments (razorpay SDK)
- Appwrite Storage for product images (node-appwrite + multer)
- Swagger / OpenAPI 3.0 docs (swagger-jsdoc + swagger-ui-express)
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
| POST   | `/`                | Private | Checkout — creates the order, empties the cart, and (if Razorpay is configured) opens a Razorpay order, returning its `payment` details for Checkout |
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

## Verification performed
- Every file syntax-checks under Node's ESM parser (`node --check`).
- Every module/route/controller was `import`-loaded successfully.
- The generated OpenAPI spec was inspected directly: **24 documented paths**
  across all 8 modules, 18 reusable schemas.
- The real Express app (routes, middleware, Swagger UI) was booted and hit
  over HTTP: `/health` → 200, `/api-docs.json` → 200 with the full path list,
  `/api-docs` → 200 serving the Swagger UI HTML, an unauthenticated request
  to a protected route → 401 as expected, and a DB-backed route correctly
  reaches Mongoose (fails with 500 only because no MongoDB is reachable in
  this sandbox).
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
verify → login → checkout → pay → upload-image flow end-to-end against a
real MongoDB, Razorpay test account, and Appwrite project before deploying**.
