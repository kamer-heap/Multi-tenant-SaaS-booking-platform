import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { apiErrorResponse, apiSuccess } from "@/lib/api-error";
import { withTenant } from "@/lib/tenant-context";

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const result = await withTenant(request, async (client) => (await client.query(
      `SELECT id, amount_paid, currency, status, hosted_invoice_url, created_at
         FROM invoices ORDER BY created_at DESC`,
    )).rows);
    return apiSuccess({ invoices: result }, 200, requestId);
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
