import { buildBaseEmail } from "../../../mailtemplate/baseTemplate";
import { formatDate, renderKeyValueRows } from "../../../mailtemplate/utils";
import {
  MESSAGE_TYPES,
  MessageType,
  NotificationChannel,
} from "../constants/messageType.constants";

const formatContextRows = (
  context: Record<string, unknown>
): string => {
  const entries = Object.entries(context).filter(
    ([, value]) => value !== undefined && value !== null && value !== ""
  );

  if (entries.length === 0) {
    return "";
  }

  return renderKeyValueRows(
    entries.map(([label, value]) => ({
      label,
      value:
        value instanceof Date
          ? formatDate(value)
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value),
    }))
  );
};

const buildGenericEmail = (
  title: string,
  intro: string,
  context: Record<string, unknown>,
  recipientName?: string
): string => {
  const greeting = recipientName
    ? `<p>Dear <strong>${recipientName}</strong>,</p>`
    : `<p>Hello,</p>`;

  const rows = formatContextRows(context);

  const body = `
    ${greeting}
    <p>${intro}</p>
    ${
      rows
        ? `<h3>Details</h3><table><tbody>${rows}</tbody></table>`
        : ""
    }
    <p style="margin-top: 20px; font-size: 14px; color: #6b7280;">
      Fly East Nepal automated notification
    </p>
  `;

  return buildBaseEmail({ title, bodyHtml: body });
};

const buildSystemErrorEmail = (
  context: Record<string, unknown>,
  recipientName?: string
): string => {
  const stack =
    typeof context.stack === "string"
      ? `<pre style="background:#f3f4f6;padding:12px;border-radius:6px;overflow:auto;font-size:12px;">${context.stack}</pre>`
      : "";

  const safeContext = { ...context };
  delete safeContext.stack;

  const greeting = recipientName
    ? `<p>Dear <strong>${recipientName}</strong>,</p>`
    : `<p>Hello,</p>`;

  const rows = formatContextRows(safeContext);

  const body = `
    ${greeting}
    <p>A system error occurred in Fly East Backend.</p>
    <table><tbody>${rows}</tbody></table>
    ${stack}
  `;

  return buildBaseEmail({
    title: "System Error Alert",
    bodyHtml: body,
  });
};

const buildPlainText = (
  messageType: MessageType,
  context: Record<string, unknown>
): string => {
  const summary = Object.entries(context)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("\n");

  return `[${messageType}]\n${summary}`;
};

export interface BuiltNotificationContent {
  subject: string;
  html?: string;
  body?: string;
}

export const buildNotificationContent = (
  messageType: MessageType,
  channel: NotificationChannel,
  context: Record<string, unknown>,
  recipientName?: string
): BuiltNotificationContent => {
  const subjectMap: Record<MessageType, string> = {
    [MESSAGE_TYPES.NEW_INQUIRY]: "New Inquiry",
    [MESSAGE_TYPES.NEW_CONTACT_LEAD]: "New Contact Lead",
    [MESSAGE_TYPES.NEW_LEAD]: "New Lead",
    [MESSAGE_TYPES.NEW_BOOKING]: "New Booking",
    [MESSAGE_TYPES.PAYMENT_RECEIVED]: "Payment Received",
    [MESSAGE_TYPES.QUOTE_FINALIZED]: "Quote Finalized",
    [MESSAGE_TYPES.BOOKING_CANCELLED]: "Booking Cancelled",
    [MESSAGE_TYPES.SYSTEM_ERROR]: "System Error Alert",
    [MESSAGE_TYPES.PAYMENT_CONFIRMATION]: "Payment Confirmation",
    [MESSAGE_TYPES.QUOTE_SENT]: "Quote Sent",
    [MESSAGE_TYPES.BOOKING_CONFIRMATION]: "Booking Confirmation",
    [MESSAGE_TYPES.PAYMENT_CANCELLED]: "Payment Cancelled",
    [MESSAGE_TYPES.PAYMENT_AUTHORIZED]: "Payment Authorized",
    [MESSAGE_TYPES.BOOKING_CANCELLED_CUSTOMER]: "Booking Cancelled (Traveler)",
  };

  const introMap: Record<MessageType, string> = {
    [MESSAGE_TYPES.NEW_INQUIRY]:
      "You have received a new package inquiry.",
    [MESSAGE_TYPES.NEW_CONTACT_LEAD]:
      "You have received a new contact form submission.",
    [MESSAGE_TYPES.NEW_LEAD]:
      "A customer has started a booking (new lead).",
    [MESSAGE_TYPES.NEW_BOOKING]: "A new booking has been created.",
    [MESSAGE_TYPES.PAYMENT_RECEIVED]:
      "A booking payment has been received.",
    [MESSAGE_TYPES.QUOTE_FINALIZED]:
      "A booking quote has been finalized.",
    [MESSAGE_TYPES.BOOKING_CANCELLED]: "A booking has been cancelled.",
    [MESSAGE_TYPES.SYSTEM_ERROR]: "A system error occurred.",
    [MESSAGE_TYPES.PAYMENT_CONFIRMATION]:
      "Traveler payment confirmation notification.",
    [MESSAGE_TYPES.QUOTE_SENT]: "Traveler quote notification.",
    [MESSAGE_TYPES.BOOKING_CONFIRMATION]:
      "Traveler booking confirmation notification.",
    [MESSAGE_TYPES.PAYMENT_CANCELLED]:
      "Traveler payment cancelled notification.",
    [MESSAGE_TYPES.PAYMENT_AUTHORIZED]:
      "Traveler payment authorized notification.",
    [MESSAGE_TYPES.BOOKING_CANCELLED_CUSTOMER]:
      "Traveler booking cancelled notification.",
  };

  const subject = subjectMap[messageType] ?? "Fly East Notification";

  if (channel === "email") {
    const html =
      messageType === MESSAGE_TYPES.SYSTEM_ERROR
        ? buildSystemErrorEmail(context, recipientName)
        : buildGenericEmail(
            subject,
            introMap[messageType] ?? "Notification details:",
            context,
            recipientName
          );

    return { subject, html };
  }

  return {
    subject,
    body: buildPlainText(messageType, context),
  };
};
