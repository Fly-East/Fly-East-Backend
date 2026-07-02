export default function generateStyledMail(message: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <div style="margin-top: 10px; line-height: 1.6; font-size: 15px; color: #333;">
        ${message}
      </div>
    </div>
  `;
}
