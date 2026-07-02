import { buildBaseEmail } from "./baseTemplate";

export interface ContactReplyData {
  recipientName: string;
  message: string;
  subject?: string;
}

export const contactReplyTemplate = (data: ContactReplyData): string => {
  const body = `
    <p style="font-size: 16px; margin-bottom: 5px;">Dear <strong>${data.recipientName}</strong>,</p>
    <p style="font-size: 15px; margin-top: 15px; line-height: 1.6;">Thank you for contacting us. We appreciate you reaching out and are happy to assist you.</p>
    
    <div style="margin-top: 25px; padding: 20px; background: #ffffff; border: 2px solid #0284c7; border-radius: 8px;">
      <p style="font-weight: 600; color: #0c4a6e; margin: 0 0 12px 0; font-size: 16px;">Our Response:</p>
      <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #1f2937;">${data.message}</p>
    </div>
    
    <p style="margin-top: 25px; font-size: 14px; line-height: 1.6; color: #6b7280;">
      If you have any questions or need further assistance, please feel free to reply to this email. Our team is always ready to help.
    </p>
    
    <p style="margin-top: 25px; font-size: 14px; color: #374151; line-height: 1.5;">
      Best regards,<br/>
      <strong style="color: #DC2626; font-size: 15px;">Fly East Nepal Team</strong>
    </p>
  `;

  return buildBaseEmail({
    title: data.subject ?? "Contact Update",
    bodyHtml: body,
  });
};
