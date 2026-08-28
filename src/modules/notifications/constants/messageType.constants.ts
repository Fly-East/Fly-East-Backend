export const MESSAGE_TYPES = {
  NEW_INQUIRY: "new_inquiry",
  NEW_CONTACT_LEAD: "new_contact_lead",
  NEW_BOOKING: "new_booking",
  PAYMENT_RECEIVED: "payment_received",
  QUOTE_FINALIZED: "quote_finalized",
  BOOKING_CANCELLED: "booking_cancelled",
  SYSTEM_ERROR: "system_error",
} as const;

export type MessageType =
  (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export const MESSAGE_TYPE_VALUES = Object.values(MESSAGE_TYPES);

export const MESSAGE_TYPE_CATEGORIES = ["business", "system"] as const;
export type MessageTypeCategory =
  (typeof MESSAGE_TYPE_CATEGORIES)[number];

export const NOTIFICATION_CHANNELS = ["email", "whatsapp", "sms"] as const;
export type NotificationChannel =
  (typeof NOTIFICATION_CHANNELS)[number];

export const WHATSAPP_STATUSES = [
  "unknown",
  "reachable",
  "unreachable",
] as const;
export type WhatsappStatus = (typeof WHATSAPP_STATUSES)[number];

export const NOTIFICATION_LOG_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "failed",
] as const;
export type NotificationLogStatus =
  (typeof NOTIFICATION_LOG_STATUSES)[number];

export interface MessageTypeDefinition {
  messageType: MessageType;
  label: string;
  description: string;
  category: MessageTypeCategory;
}

export const MESSAGE_TYPE_DEFINITIONS: MessageTypeDefinition[] = [
  {
    messageType: MESSAGE_TYPES.NEW_INQUIRY,
    label: "New Inquiry",
    description: "Fired when a package inquiry form is submitted",
    category: "business",
  },
  {
    messageType: MESSAGE_TYPES.NEW_CONTACT_LEAD,
    label: "New Contact Lead",
    description: "Fired when a contact form is submitted",
    category: "business",
  },
  {
    messageType: MESSAGE_TYPES.NEW_BOOKING,
    label: "New Booking",
    description: "Fired when a customer creates a booking",
    category: "business",
  },
  {
    messageType: MESSAGE_TYPES.PAYMENT_RECEIVED,
    label: "Payment Received",
    description: "Fired when a booking payment succeeds",
    category: "business",
  },
  {
    messageType: MESSAGE_TYPES.QUOTE_FINALIZED,
    label: "Quote Finalized",
    description: "Fired when an admin finalizes a booking quote",
    category: "business",
  },
  {
    messageType: MESSAGE_TYPES.BOOKING_CANCELLED,
    label: "Booking Cancelled",
    description: "Fired when a booking is cancelled",
    category: "business",
  },
  {
    messageType: MESSAGE_TYPES.SYSTEM_ERROR,
    label: "System Error",
    description: "Fired on server errors, worker failures, and crashes",
    category: "system",
  },
];
