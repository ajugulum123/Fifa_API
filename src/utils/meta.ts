/**
 * meta.ts
 * Helpers that produce OperationMeta objects matching the schema's
 * OperationMeta type.  Every resolver calls one of these functions
 * so the httpStatus / code / category / statusMessage fields are
 * always consistent.
 */

export type ErrorCategory = 'SUCCESS' | 'REDIRECTION' | 'CLIENT_ERROR' | 'SERVER_ERROR';

export type ErrorCode =
  // 2xx
  | 'OK' | 'CREATED' | 'ACCEPTED' | 'NO_CONTENT'
  // 3xx
  | 'MOVED_PERMANENTLY' | 'TEMPORARY_REDIRECT' | 'PERMANENT_REDIRECT'
  // 4xx
  | 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'CONFLICT' | 'GONE' | 'UNPROCESSABLE_ENTITY' | 'TOO_MANY_REQUESTS'
  // 5xx
  | 'INTERNAL_SERVER_ERROR' | 'NOT_IMPLEMENTED' | 'BAD_GATEWAY'
  | 'SERVICE_UNAVAILABLE' | 'GATEWAY_TIMEOUT';

export interface OperationMeta {
  httpStatus:        number;
  code:              ErrorCode;
  category:          ErrorCategory;
  statusMessage:     string;
  timestamp:         string;
  redirectTarget?:   string;
  retryAfterSeconds?: number;
}

export interface UserError {
  message:         string;
  field?:          string | null;
  code:            ErrorCode;
  category:        ErrorCategory;
  redirectTarget?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP status → metadata mapping
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<ErrorCode, { httpStatus: number; category: ErrorCategory; statusMessage: string }> = {
  // 2xx
  OK:                    { httpStatus: 200, category: 'SUCCESS',      statusMessage: 'OK' },
  CREATED:               { httpStatus: 201, category: 'SUCCESS',      statusMessage: 'Created' },
  ACCEPTED:              { httpStatus: 202, category: 'SUCCESS',      statusMessage: 'Accepted' },
  NO_CONTENT:            { httpStatus: 204, category: 'SUCCESS',      statusMessage: 'No Content' },
  // 3xx
  MOVED_PERMANENTLY:     { httpStatus: 301, category: 'REDIRECTION',  statusMessage: 'Moved Permanently' },
  TEMPORARY_REDIRECT:    { httpStatus: 307, category: 'REDIRECTION',  statusMessage: 'Temporary Redirect' },
  PERMANENT_REDIRECT:    { httpStatus: 308, category: 'REDIRECTION',  statusMessage: 'Permanent Redirect' },
  // 4xx
  BAD_REQUEST:           { httpStatus: 400, category: 'CLIENT_ERROR', statusMessage: 'Bad Request' },
  UNAUTHORIZED:          { httpStatus: 401, category: 'CLIENT_ERROR', statusMessage: 'Unauthorized' },
  FORBIDDEN:             { httpStatus: 403, category: 'CLIENT_ERROR', statusMessage: 'Forbidden' },
  NOT_FOUND:             { httpStatus: 404, category: 'CLIENT_ERROR', statusMessage: 'Not Found' },
  CONFLICT:              { httpStatus: 409, category: 'CLIENT_ERROR', statusMessage: 'Conflict' },
  GONE:                  { httpStatus: 410, category: 'CLIENT_ERROR', statusMessage: 'Gone' },
  UNPROCESSABLE_ENTITY:  { httpStatus: 422, category: 'CLIENT_ERROR', statusMessage: 'Unprocessable Entity' },
  TOO_MANY_REQUESTS:     { httpStatus: 429, category: 'CLIENT_ERROR', statusMessage: 'Too Many Requests' },
  // 5xx
  INTERNAL_SERVER_ERROR: { httpStatus: 500, category: 'SERVER_ERROR', statusMessage: 'Internal Server Error' },
  NOT_IMPLEMENTED:       { httpStatus: 501, category: 'SERVER_ERROR', statusMessage: 'Not Implemented' },
  BAD_GATEWAY:           { httpStatus: 502, category: 'SERVER_ERROR', statusMessage: 'Bad Gateway' },
  SERVICE_UNAVAILABLE:   { httpStatus: 503, category: 'SERVER_ERROR', statusMessage: 'Service Unavailable' },
  GATEWAY_TIMEOUT:       { httpStatus: 504, category: 'SERVER_ERROR', statusMessage: 'Gateway Timeout' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Factory functions
// ─────────────────────────────────────────────────────────────────────────────

export function buildMeta(
  code: ErrorCode,
  extras?: { redirectTarget?: string; retryAfterSeconds?: number }
): OperationMeta {
  const { httpStatus, category, statusMessage } = STATUS_MAP[code];
  return {
    httpStatus,
    code,
    category,
    statusMessage,
    timestamp: new Date().toISOString(),
    ...(extras?.redirectTarget    ? { redirectTarget:    extras.redirectTarget    } : {}),
    ...(extras?.retryAfterSeconds ? { retryAfterSeconds: extras.retryAfterSeconds } : {}),
  };
}

export function buildError(
  code: ErrorCode,
  message: string,
  field?: string,
  redirectTarget?: string
): UserError {
  const { category } = STATUS_MAP[code];
  return {
    message,
    code,
    category,
    ...(field          ? { field }          : { field: null }),
    ...(redirectTarget ? { redirectTarget }  : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validator helpers used by mutation resolvers
// ─────────────────────────────────────────────────────────────────────────────

export function validateSkillRange(
  value: number | null | undefined,
  fieldPath: string,
  required = true
): UserError | null {
  if (value === null || value === undefined) {
    return required
      ? buildError('UNPROCESSABLE_ENTITY', `${fieldPath} is required.`, fieldPath)
      : null;
  }
  if (value < 0 || value > 99) {
    return buildError(
      'UNPROCESSABLE_ENTITY',
      `${fieldPath} must be between 0 and 99. Got ${value}.`,
      fieldPath
    );
  }
  return null;
}

export function validateAge(age: number, fieldPath = 'input.age'): UserError | null {
  if (age < 15 || age > 50) {
    return buildError(
      'UNPROCESSABLE_ENTITY',
      `Age must be between 15 and 50. Got ${age}.`,
      fieldPath
    );
  }
  return null;
}

export function validateHeight(cm: number, fieldPath = 'input.heightCm'): UserError | null {
  if (cm < 140 || cm > 220) {
    return buildError(
      'UNPROCESSABLE_ENTITY',
      `Height must be between 140 and 220 cm. Got ${cm}.`,
      fieldPath
    );
  }
  return null;
}
