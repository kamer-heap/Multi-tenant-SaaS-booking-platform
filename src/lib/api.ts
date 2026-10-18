import type { CreateBooking, UpdateBooking } from "@/lib/schemas/booking";

export type Booking = {
  id: string;
  tenantId: string;
  createdBy: string | null;
  title: string;
  clientName: string;
  clientEmail: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string;
  createdAt: string;
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ path?: Array<string | number>; message?: string }>;
    requestId?: string;
  };
};
type ApiErrorDetails = NonNullable<NonNullable<ApiErrorPayload["error"]>["details"]>;

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: ApiErrorDetails,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const { idempotencyKey, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  headers.set("Accept", "application/json");
  if (requestOptions.body) headers.set("Content-Type", "application/json");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(path, { ...requestOptions, headers });
      const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
      if (response.ok) return payload as T;

      const apiError = new ApiClientError(
        payload.error?.message ?? "Something went wrong.",
        payload.error?.code,
        payload.error?.details,
      );
      if (typeof window !== "undefined") {
        const { toast } = await import("sonner");
        toast.error(apiError.message);
      }
      throw apiError;
    } catch (error) {
      const status = error instanceof ApiClientError ? Number(error.code === "INTERNAL" ? 500 : 400) : 0;
      const retryable = !(error instanceof ApiClientError) || status >= 500;
      if (!retryable || attempt >= 2) {
        if (!(error instanceof ApiClientError) && typeof window !== "undefined") {
          const { toast } = await import("sonner");
          toast.error("Network error. Please try again.");
        }
        throw error;
      }
      await wait(250 * 2 ** attempt);
      attempt += 1;
    }
  }
}

export async function listBookings(): Promise<{ bookings: Booking[] }> {
  return apiRequest("/api/bookings");
}

export function createBooking(input: CreateBooking, idempotencyKey: string) {
  return apiRequest<Booking>("/api/bookings", {
    method: "POST",
    body: JSON.stringify(input),
    idempotencyKey,
  });
}

export function updateBooking(id: string, input: UpdateBooking) {
  return apiRequest<Booking>(`/api/bookings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteBooking(id: string) {
  return apiRequest<{ deleted: true }>(`/api/bookings/${id}`, { method: "DELETE" });
}
