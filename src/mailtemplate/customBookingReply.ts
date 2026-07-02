import { buildBaseEmail } from "./baseTemplate";

export interface CustomBookingReplyData {
  bookingReference: string;
  message: string;
  subject?: string;
}

export const customBookingReplyTemplate = (
  data: CustomBookingReplyData,
): string => {
  const body = `
    <p>This is an update regarding your custom booking request.</p>
    <p><strong>Reference:</strong> ${data.bookingReference}</p>
    <div class="card">
      <strong>Message</strong>
      <p>${data.message}</p>
    </div>
  `;

  return buildBaseEmail({
    title: data.subject ?? "Custom Booking Update",
    bodyHtml: body,
  });
};
