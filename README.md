# Zevrae Backend

A complete e-commerce backend (Node.js/Express + MongoDB/Mongoose) built out
from the `products` schema you originally provided. Since only the database
section was included, I designed the rest of the application around it:
auth, users, categories, cart, orders, and reviews.

## Stack
- Express (ES Modules — `"type": "module"`)
- Mongoose (MongoDB)
- JWT auth (jsonwebtoken + bcryptjs)
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
| Method | Route              | Access  | Description        |
|--------|---------------------|---------|---------------------|
| POST   | `/register`          | Public  | Create an account   |
| POST   | `/login`             | Public  | Get a JWT           |
| GET    | `/me`                | Private | Current user profile|

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
| POST   | `/`                | Private | Checkout — creates order from cart, empties cart |
| GET    | `/`                | Private | List own orders (admin sees all)      |
| GET    | `/:id`             | Owner/Admin | Get one order                     |
| PATCH  | `/:id/status`      | Admin   | Update `order_status` / `payment_status` |

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
- **Payments**: `payment_status` field exists on Order but no payment
  gateway is integrated — add Stripe/Razorpay/etc. in `orderController.js`
  where noted.

## Verification performed
- Every file syntax-checks under Node's ESM parser (`node --check`).
- Every module/route/controller was `import`-loaded successfully.
- The generated OpenAPI spec was inspected directly: **19 documented paths**
  across all 7 modules, 17 reusable schemas.
- The real Express app (routes, middleware, Swagger UI) was booted and hit
  over HTTP: `/health` → 200, `/api-docs.json` → 200 with the full path list,
  `/api-docs` → 200 serving the Swagger UI HTML, an unauthenticated request
  to a protected route → 401 as expected, and a DB-backed route correctly
  reaches Mongoose (fails with 500 only because no MongoDB is reachable in
  this sandbox).

A full live-DB integration test wasn't possible here (MongoDB binary
downloads are network-restricted in this sandbox), so **test the auth →
cart → checkout flow against a real MongoDB instance before deploying**.
