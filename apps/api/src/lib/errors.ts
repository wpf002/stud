export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = 'error',
    public details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (m: string, details?: unknown) =>
  new HttpError(400, m, 'bad_request', details);
export const unauthorized = (m = 'Sign in required') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'You do not have access to this') => new HttpError(403, m, 'forbidden');
export const notFound = (m = 'Not found') => new HttpError(404, m, 'not_found');
export const conflict = (m: string, details?: unknown) => new HttpError(409, m, 'conflict', details);
export const unprocessable = (m: string, details?: unknown) =>
  new HttpError(422, m, 'unprocessable', details);
