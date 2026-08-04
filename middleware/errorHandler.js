const ALLOWED_ORIGINS = [
  'https://www.zevrae.com',
  'https://zevrae.com',
  'http://localhost:3000',
  'http://localhost:5000',
];

/**
 * Ensures CORS headers are always present on the response, even when an
 * error bypasses the cors() middleware (e.g. multer, auth, validation errors).
 * Without this the browser sees a response with no Access-Control-Allow-Origin
 * and reports it as a CORS error, hiding the real problem.
 */
function ensureCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

export function notFound(req, res, next) {
  ensureCors(req, res);
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
}

export function errorHandler(err, req, res, next) {
  // Always set CORS headers first so the browser can read the error body
  ensureCors(req, res);

  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  let message = err.message;

  // Mongoose bad ObjectId
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Resource not found';
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  // Multer file upload errors (bad file type, too large, too many files)
  if (err.name === 'MulterError') {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'One or more files are too large. Each image must be under 15MB.'
      : err.message;
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {}).join(', ');
    message = `Duplicate value for field: ${field}`;
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
}

