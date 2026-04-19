import { HttpError } from "./errors.js";

export function asyncHandler(fn) {
  return async function wrapped(req, res, next) {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export function oauthErrorResponse(res, status, error, errorDescription) {
  return res.status(status).json({
    error,
    error_description: errorDescription
  });
}

export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: error.error,
      error_description: error.description
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: "server_error",
    error_description: "Unexpected server error."
  });
}
