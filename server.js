import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import collectionRoutes from "./routes/collectionRoutes.js";
import discountRoutes from "./routes/discountRoutes.js";
import connectDB from "./config/db.js";
import swaggerSpec from "./config/swagger.js";
import productRoutes from "./routes/productRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import { standaloneRouter as reviewStandaloneRoutes } from "./routes/reviewRoutes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import analysisRoutes from "./routes/analysisRoutes.js";
import tryonRoutes from './routes/tryonRoutes.js';


const app = express();

// --- Middleware ---
// Full Helmet defaults (including CSP) for the whole app; Swagger UI needs
// its CSP relaxed for its inline scripts/styles, so that's applied only on
// the /api-docs routes below instead of globally.
app.use(helmet());
app.use(cors());
// The `verify` hook stashes the raw request body on req.rawBody — needed to
// check the Razorpay webhook's HMAC signature, which must be computed over
// the exact bytes received, not the re-serialized parsed object.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// --- Health check ---
app.get("/health", (req, res) => res.json({ status: "ok" }));

// --- API docs ---
// Swagger UI's inline scripts/styles are blocked by Helmet's default CSP,
// so relax it only for these routes rather than for the whole app.
app.use(
  "/api-docs",
  helmet({ contentSecurityPolicy: false }),
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, { customSiteTitle: "Zevrae API Docs" }),
);
app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));

// --- Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewStandaloneRoutes);
app.use("/api/discounts", discountRoutes);
app.use("/api/collections", collectionRoutes);
app.use("/api/analysis", analysisRoutes);
app.use('/api/tryon', tryonRoutes);

// --- Error handling (must be last) ---
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API docs available at http://localhost:${PORT}/api-docs`);
  });
};

start();

export default app;
