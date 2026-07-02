import { buildBaseEmail } from "./baseTemplate";

export interface ForgotPasswordData {
  resetUrl: string;
  expiresIn?: string;
  recipientName?: string;
}

export const forgotPasswordTemplate = (data: ForgotPasswordData): string => {
  const expiresText = data.expiresIn ?? "1 hour";
  const greeting = data.recipientName
    ? `Dear <strong>${data.recipientName}</strong>,`
    : "Hello,";

  const body = `
    <p style="font-size: 16px; margin-bottom: 5px;">${greeting}</p>
    <p style="font-size: 15px; margin-top: 15px; line-height: 1.6;">
      We received a request to reset your password for your Fly East Nepal account. Click the button below to create a new password.
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a class="button" href="${data.resetUrl}" style="display: inline-block; padding: 14px 32px; background: #DC2626; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Reset Password</a>
    </div>
    
    <p style="margin-top: 25px; font-size: 14px; line-height: 1.6; color: #6b7280;">
      If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
    </p>
    
    <p style="margin-top: 25px; font-size: 14px; color: #374151; line-height: 1.5;">
      Best regards,<br/>
      <strong style="color: #DC2626; font-size: 15px;">Fly East Nepal Team</strong>
    </p>
  `;

  return buildBaseEmail({
    title: "Password Reset",
    bodyHtml: body,
  });
};
