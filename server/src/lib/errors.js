export class HttpError extends Error {
  constructor(status, error, description) {
    super(description || error);
    this.status = status;
    this.error = error;
    this.description = description || error;
  }
}

export function assert(condition, status, error, description) {
  if (!condition) {
    throw new HttpError(status, error, description);
  }
}
