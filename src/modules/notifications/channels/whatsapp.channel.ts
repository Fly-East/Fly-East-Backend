import axios from "axios";
import logger from "../../../utils/logger";
import {
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from "../constants/messageType.constants";
import {
  ChannelDeliveryResult,
  INotificationChannel,
} from "./channel.interface";
import { NotificationJobPayload } from "../types/notifications.types";

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL ?? "https://graph.facebook.com/v21.0";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const isWhatsAppConfigured = (): boolean =>
  Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);

const WHATSAPP_TEMPLATE_MAP: Partial<Record<string, string>> = {
  new_inquiry: "new_inquiry_alert",
  new_contact_lead: "new_contact_alert",
  new_lead: "new_lead_alert",
  new_booking: "new_booking_alert",
  payment_received: "payment_received_alert",
  quote_finalized: "quote_finalized_alert",
  booking_cancelled: "booking_cancelled_alert",
  system_error: "system_error_alert",
  payment_confirmation: "payment_confirmation",
  quote_sent: "quote_sent",
  booking_confirmation: "booking_confirmation",
  payment_cancelled: "payment_cancelled",
  payment_authorized: "payment_authorized",
  booking_cancelled_customer: "booking_cancelled_customer",
};

export class WhatsAppChannelProvider implements INotificationChannel {
  readonly channel: NotificationChannel = NOTIFICATION_CHANNELS[1];

  canDeliverTo(recipient: string): boolean {
    return Boolean(recipient && recipient.startsWith("+"));
  }

  async send(payload: NotificationJobPayload): Promise<ChannelDeliveryResult> {
    if (!this.canDeliverTo(payload.to)) {
      return {
        status: "failed",
        error: "Invalid WhatsApp phone number (E.164 required)",
        shouldFallback: true,
      };
    }

    if (!isWhatsAppConfigured()) {
      logger.warn(
        `WhatsApp provider not configured; skipping delivery to ${payload.to}`
      );
      return {
        status: "failed",
        error: "WhatsApp provider is not configured",
        shouldFallback: true,
      };
    }

    const templateName =
      WHATSAPP_TEMPLATE_MAP[payload.messageType] ?? "system_error_alert";

    const summary =
      payload.body ??
      `${payload.messageType}: ${JSON.stringify(payload.context).slice(0, 200)}`;

    try {
      const response = await axios.post(
        `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: payload.to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: templateName,
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: summary.slice(0, 1024) }],
              },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      const providerMessageId = response.data?.messages?.[0]?.id as
        | string
        | undefined;

      return {
        status: "sent",
        providerMessageId,
      };
    } catch (error: any) {
      const errorCode =
        error?.response?.data?.error?.code ??
        error?.response?.data?.errors?.[0]?.code;
      const message =
        error?.response?.data?.error?.message ??
        (error instanceof Error ? error.message : "WhatsApp delivery failed");

      const shouldFallback = errorCode === 131026 || !isWhatsAppConfigured();

      return {
        status: "failed",
        error: message,
        errorCode: typeof errorCode === "number" ? errorCode : undefined,
        shouldFallback,
      };
    }
  }
}

export const whatsappChannelProvider = new WhatsAppChannelProvider();
