import { buildBaseEmail } from "./baseTemplate";

export interface DetailedItineraryData {
  packageName?: string;
  recipientName?: string;
}

export const detailedItineraryTemplate = (
  data: DetailedItineraryData,
): string => {
  const packageLabel = data.packageName
    ? ` for <strong>"${data.packageName}"</strong>`
    : "";

  const greeting = data.recipientName
    ? `Dear <strong>${data.recipientName}</strong>,`
    : "Dear Valued Customer,";

  const body = `
    <p style="font-size: 16px; margin-bottom: 5px;">${greeting}</p>
    <p style="font-size: 15px; margin-top: 15px; line-height: 1.6;">
      Thank you for requesting the detailed itinerary${packageLabel}. We're excited to share all the details of your upcoming adventure!
    </p>
    
    <div style="margin-top: 25px; padding: 20px; background: #ffffff; border: 2px solid #DC2626; border-radius: 8px;">
      <p style="font-weight: 700; color: #DC2626; margin: 0 0 12px 0; font-size: 16px;">Attached Document</p>
      <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #1f2937;">
        📄 The detailed itinerary PDF is attached to this email. It includes:
      </p>
      <ul style="margin: 12px 0 0 20px; font-size: 14px; line-height: 1.8; color: #374151;">
        <li>Complete day-by-day schedule</li>
        <li>Accommodation details</li>
        <li>Activities and excursions</li>
        <li>Meal arrangements</li>
        <li>Important travel information</li>
      </ul>
    </div>
    
    <p style="margin-top: 25px; font-size: 14px; line-height: 1.6; color: #6b7280;">
      If you have any questions about the itinerary or need any modifications, please don't hesitate to contact us. We're here to ensure your trip is perfect!
    </p>
    
    <p style="margin-top: 25px; font-size: 14px; color: #374151; line-height: 1.5;">
      Best regards,<br/>
      <strong style="color: #DC2626; font-size: 15px;">Fly East Nepal Team</strong>
    </p>
  `;

  return buildBaseEmail({
    title: "Detailed Itinerary",
    bodyHtml: body,
  });
};
