export type BookingTripWindowInput = {
  arrivalDate?: Date | string | null;
  departureDate?: Date | string | null;
  fixedDate?: {
    startDate?: Date | string | null;
    endDate?: Date | string | null;
  } | null;
};

export type BookingTripWindow = {
  tripStartDate: string | null;
  tripEndDate: string | null;
};

function toDateOnly(value?: Date | string | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Resolve trip calendar window for a booking.
 * Prefer explicit arrival/departure; fall back to fixed departure dates.
 */
export function resolveBookingTripWindow(
  booking: BookingTripWindowInput,
): BookingTripWindow {
  const fixed = booking.fixedDate ?? null;
  return {
    tripStartDate:
      toDateOnly(booking.arrivalDate) ?? toDateOnly(fixed?.startDate) ?? null,
    tripEndDate:
      toDateOnly(booking.departureDate) ?? toDateOnly(fixed?.endDate) ?? null,
  };
}
