import { randomUUID } from "node:crypto";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "IDEMPOTENCY_MISMATCH"
  | "INTERNAL";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiErrorResponse(error: unknown, requestId = randomUUID()): Response {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError("INTERNAL", "An unexpected error occurred.", 500);

  return Response.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        ...(apiError.details === undefined ? {} : { details: apiError.details }),
        requestId,
      },
    },
    { status: apiError.status, headers: { "X-Request-Id": requestId } },
  );
}

export function apiSuccess<T>(body: T, status = 200, requestId = randomUUID()): Response {
  return Response.json(body, {
    status,
    headers: { "X-Request-Id": requestId },
  });
}
