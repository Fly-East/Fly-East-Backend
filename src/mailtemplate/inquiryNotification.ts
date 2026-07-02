import { buildBaseEmail } from "./baseTemplate";
import { formatDate, renderKeyValueRows } from "./utils";

export interface InquiryNotificationData {
  recipientName?: string;
  leadName: string;
  leadEmail: string;
  leadPhone?: string;
  leadMessage?: string;
  packageName?: string | null;
  source?: string;
  inquiryId?: string;
  createdAt?: Date;
}

export const inquiryNotificationTemplate = (
  data: InquiryNotificationData,
): string => {
  const greeting = data.recipientName
    ? `<p style="font-size: 16px; margin-bottom: 5px;">Dear <strong>${data.recipientName}</strong>,</p>`
    : `<p style="font-size: 16px; margin-bottom: 5px;">Hello,</p>`;

  const rows = renderKeyValueRows([
    { label: "Name", value: data.leadName },
    { label: "Email", value: data.leadEmail },
    { label: "Phone", value: data.leadPhone },
    { label: "Package", value: data.packageName ?? undefined },
    { label: "Source", value: data.source },
    { label: "Inquiry ID", value: data.inquiryId },
    {
      label: "Received",
      value: data.createdAt ? formatDate(data.createdAt) : undefined,
    },
  ]);

  const messageBlock = data.leadMessage
    ? `
    <div style="margin-top: 25px; padding: 20px; background: #ffffff; border: 2px solid #0284c7; border-radius: 8px;">
      <p style="font-weight: 600; color: #0c4a6e; margin: 0 0 12px 0; font-size: 16px;">Customer Message:</p>
      <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #1f2937;">${data.leadMessage}</p>
    </div>
    `
    : "";

  const body = `
    ${greeting}
    <p style="font-size: 15px; margin-top: 15px; line-height: 1.6;">
      You have received a new inquiry from a potential customer. Please review the details below and respond promptly.
    </p>
    
    <h3>Customer Information</h3>
    <table>
      <tbody>
        ${rows}
      </tbody>
    </table>
    ${messageBlock}
    
    <p style="margin-top: 25px; font-size: 14px; line-height: 1.6; color: #6b7280;">
      Please respond to this inquiry as soon as possible to provide excellent customer service.
    </p>
    
    <p style="margin-top: 25px; font-size: 14px; color: #374151; line-height: 1.5;">
      Best regards,<br/>
      <strong style="color: #DC2626; font-size: 15px;">Fly East Nepal System</strong>
    </p>
  `;

  return buildBaseEmail({
    title: "New Inquiry",
    bodyHtml: body,
  });
};
