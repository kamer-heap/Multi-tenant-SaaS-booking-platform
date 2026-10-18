export type BookingRow = {
  id: string;
  tenant_id: string;
  created_by: string | null;
  title: string;
  client_name: string;
  client_email: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  notes: string;
  created_at: Date;
};

export function serializeBooking(row: BookingRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    createdBy: row.created_by,
    title: row.title,
    clientName: row.client_name,
    clientEmail: row.client_email,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
  };
}
