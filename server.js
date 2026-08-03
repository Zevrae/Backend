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
import normalizeIds from "./middleware/normalizeIds.js";
import analysisRoutes from "./routes/analysisRoutes.js";
import tryonRoutes from "./routes/tryonRoutes.js";
import imageRoutes from "./routes/imageRoutes.js";

const app = express();

// --- Middleware ---
app.use(helmet());

// ✅ Improved CORS config
const allowedOrigins = [
  "https://www.zevrae.com",
  "https://zevrae.com"
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ Explicit preflight handler
app.options("*", (req, res) => {
  const origin = allowedOrigins.includes(req.headers.origin) ? req.headers.origin : allowedOrigins[0];
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.sendStatus(200);
});

// Razorpay webhook raw body
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

app.use(normalizeIds);

// --- API docs ---
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
app.use("/api/tryon", tryonRoutes);
app.use("/api/images", imageRoutes);

// --- Error handling ---
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
