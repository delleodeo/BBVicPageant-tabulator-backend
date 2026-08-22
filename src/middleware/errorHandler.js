import { HttpError } from '../utils/httpError.js';

export function notFound(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, _req, res, _next) {
  const isDuplicateKey = err.code === 11000;
  const status = err.status || (err.name === 'ValidationError' ? 422 : isDuplicateKey ? 409 : 500);
  const duplicateFields = isDuplicateKey ? Object.keys(err.keyValue || err.keyPattern || {}) : [];
  const message = status === 500 ? 'Server error.' : err.message;

  if (status === 500) {
    console.error(err);
  }

  res.status(status).json({
    message: isDuplicateKey
      ? `${duplicateFields.join(', ') || 'Value'} already exists.`
      : message,
    details: err.details || (isDuplicateKey ? err.keyValue : undefined)
  });
}
