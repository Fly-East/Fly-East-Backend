import { buildBaseEmail } from "./baseTemplate";
import { renderKeyValueRows } from "./utils";

export interface BookingConfirmationTravelerData {
  travelerName: string;
  travelerEmail: string;
  travelerPhone?: string;
  travelerCountry?: string;
  bookingId: string;
  tripType?: string;
  arrivalDate?: string;
  departureDate?: string;
  duration?: string;
  message?: string;
  contactEmail?: string;
}

export interface BookingConfirmationOwnerData {
  bookingId: string;
  tripType?: string;
  arrivalDate?: string;
  departureDate?: string;
  duration?: string;
  travelers: Array<{
    fullName: string;
    email: string;
    phoneNumber?: string;
    country?: string;
  }>;
  message?: string;
}

export const bookingConfirmationTravelerTemplate = (
  data: BookingConfirmationTravelerData,
): string => {
  const bookingRows = renderKeyValueRows([
    { label: "Booking ID", value: data.bookingId },
    { label: "Trip Type", value: data.tripType },
    { label: "Arrival Date", value: data.arrivalDate },
    { label: "Departure Date", value: data.departureDate },
    { label: "Duration", value: data.duration },
  ]);

  const travelerRows = renderKeyValueRows([
    { label: "Name", value: data.travelerName },
    { label: "Email", value: data.travelerEmail },
    { label: "Phone", value: data.travelerPhone },
    { label: "Country", value: data.travelerCountry },
  ]);

  const messageBlock = data.message
    ? `<div class="card"><strong>Additional Information</strong><p style="margin-top: 8px;">${data.message}</p></div>`
    : "";

  const contactBlock = data.contactEmail
    ? `<p style="margin-top: 20px; padding: 15px; background: #f0fdf4; border-left: 4px solid #10b981; border-radius: 6px;"><strong>Need Help?</strong><br/>For questions, reply to this email or contact <a href="mailto:${data.contactEmail}" style="color: #DC2626; text-decoration: none;">${data.contactEmail}</a></p>`
    : `<p style="margin-top: 20px; padding: 15px; background: #f0fdf4; border-left: 4px solid #10b981; border-radius: 6px;"><strong>Need Help?</strong><br/>For questions, reply to this email.</p>`;

  const body = `
    <p style="font-size: 16px; margin-bottom: 5px;">Dear <strong>${data.travelerName}</strong>,</p>
    <p style="font-size: 15px; color: #059669; font-weight: 600; margin-top: 5px;">✅ Your booking has been successfully received!</p>
    <p style="margin-top: 15px;">We're excited to have you join us. Below are your booking details:</p>
    
    <h3>Booking Details</h3>
    <table>
      <tbody>
        ${bookingRows}
      </tbody>
    </table>
    
    <h3>Your Information</h3>
    <table>
      <tbody>
        ${travelerRows}
      </tbody>
    </table>
    ${messageBlock}
    ${contactBlock}
  `;

  return buildBaseEmail({
    title: "Booking Confirmation",
    bodyHtml: body,
  });
};

export const bookingConfirmationOwnerTemplate = (
  data: BookingConfirmationOwnerData,
): string => {
  const bookingRows = renderKeyValueRows([
    { label: "Booking ID", value: data.bookingId },
    { label: "Trip Type", value: data.tripType },
    { label: "Arrival Date", value: data.arrivalDate },
    { label: "Departure Date", value: data.departureDate },
    { label: "Duration", value: data.duration },
    { label: "Travelers", value: data.travelers.length.toString() },
  ]);

  const travelerBlocks = data.travelers
    .map(
      (traveler) => `
      <div class="card">
        <strong>${traveler.fullName}</strong>
        <p>Email: ${traveler.email}</p>
        ${traveler.phoneNumber ? `<p>Phone: ${traveler.phoneNumber}</p>` : ""}
        ${traveler.country ? `<p>Country: ${traveler.country}</p>` : ""}
      </div>
    `,
    )
    .join("");

  const messageBlock = data.message
    ? `<div class="card"><strong>Customer Message</strong><p>${data.message}</p></div>`
    : "";

  const body = `
    <p>New booking received.</p>
    <h3>Booking Summary</h3>
    <table>
      <tbody>
        ${bookingRows}
      </tbody>
    </table>
    <h3>Traveler Information</h3>
    ${travelerBlocks}
    ${messageBlock}
  `;

  return buildBaseEmail({
    title: "New Booking",
    bodyHtml: body,
  });
};
