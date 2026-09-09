export const MESSAGE_TYPES = {
  NEW_INQUIRY: "new_inquiry",
  NEW_CONTACT_LEAD: "new_contact_lead",
  NEW_LEAD: "new_lead",
  NEW_BOOKING: "new_booking",
  PAYMENT_RECEIVED: "payment_received",
  QUOTE_FINALIZED: "quote_finalized",
  BOOKING_CANCELLED: "booking_cancelled",
  SYSTEM_ERROR: "system_error",
  PAYMENT_CONFIRMATION: "payment_confirmation",
  QUOTE_SENT: "quote_sent",
  BOOKING_CONFIRMATION: "booking_confirmation",
  PAYMENT_CANCELLED: "payment_cancelled",
  PAYMENT_AUTHORIZED: "payment_authorized",
  BOOKING_CANCELLED_CUSTOMER: "booking_cancelled_customer",
} as const;

export type MessageType =
  (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export const MESSAGE_TYPE_VALUES = Object.values(MESSAGE_TYPES);

export const MESSAGE_TYPE_CATEGORIES = ["business", "system"] as const;
export type MessageTypeCategory =
  (typeof MESSAGE_TYPE_CATEGORIES)[number];

export const MESSAGE_AUDIENCES = ["internal", "customer"] as const;
export type MessageAudience = (typeof MESSAGE_AUDIENCES)[number];

export const NOTIFICATION_CHANNELS = ["email", "whatsapp"] as const;
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
  audience: MessageAudience;
  defaultPrimaryChannel?: NotificationChannel;
  defaultFallbackChannel?: NotificationChannel | null;
}

export const MESSAGE_TYPE_DEFINITIONS: MessageTypeDefinition[] = [
  {
    messageType: MESSAGE_TYPES.NEW_INQUIRY,
    label: "New Inquiry",
    description: "Fired when a package inquiry form is submitted",
    category: "business",
    audience: "internal",
  },
  {
    messageType: MESSAGE_TYPES.NEW_CONTACT_LEAD,
    label: "New Contact Lead",
    description: "Fired when a contact form is submitted",
    category: "business",
    audience: "internal",
  },
  {
    messageType: MESSAGE_TYPES.NEW_LEAD,
    label: "New Lead",
    description: "Fired when a customer starts a booking (lead stage)",
    category: "business",
    audience: "internal",
  },
  {
    messageType: MESSAGE_TYPES.NEW_BOOKING,
    label: "New Booking",
    description: "Fired when a customer creates a booking",
    category: "business",
    audience: "internal",
  },
  {
    messageType: MESSAGE_TYPES.PAYMENT_RECEIVED,
    label: "Payment Received (Internal)",
    description: "Internal alert when a booking payment succeeds",
    category: "business",
    audience: "internal",
  },
  {
    messageType: MESSAGE_TYPES.QUOTE_FINALIZED,
    label: "Quote Finalized (Internal)",
    description: "Internal alert when an admin finalizes a booking quote",
    category: "business",
    audience: "internal",
  },
  {
    messageType: MESSAGE_TYPES.BOOKING_CANCELLED,
    label: "Booking Cancelled",
    description: "Fired when a booking is cancelled",
    category: "business",
    audience: "internal",
  },
  {
    messageType: MESSAGE_TYPES.SYSTEM_ERROR,
    label: "System Error",
    description: "Fired on server errors, worker failures, and crashes",
    category: "system",
    audience: "internal",
  },
  {
    messageType: MESSAGE_TYPES.PAYMENT_CONFIRMATION,
    label: "Payment Confirmation",
    description: "Sent to the traveler after successful payment (invoice/receipt)",
    category: "business",
    audience: "customer",
    defaultPrimaryChannel: NOTIFICATION_CHANNELS[0],
    defaultFallbackChannel: NOTIFICATION_CHANNELS[1],
  },
  {
    messageType: MESSAGE_TYPES.QUOTE_SENT,
    label: "Quote Sent",
    description: "Sent to the traveler when an admin finalizes a quote",
    category: "business",
    audience: "customer",
    defaultPrimaryChannel: NOTIFICATION_CHANNELS[0],
    defaultFallbackChannel: NOTIFICATION_CHANNELS[1],
  },
  {
    messageType: MESSAGE_TYPES.BOOKING_CONFIRMATION,
    label: "Booking Confirmation",
    description: "Sent to the traveler when a custom booking is created",
    category: "business",
    audience: "customer",
    defaultPrimaryChannel: NOTIFICATION_CHANNELS[0],
    defaultFallbackChannel: NOTIFICATION_CHANNELS[1],
  },
  {
    messageType: MESSAGE_TYPES.PAYMENT_CANCELLED,
    label: "Payment Cancelled",
    description:
      "Sent to the traveler when they cancel or abandon an online payment",
    category: "business",
    audience: "customer",
    defaultPrimaryChannel: NOTIFICATION_CHANNELS[0],
    defaultFallbackChannel: NOTIFICATION_CHANNELS[1],
  },
  {
    messageType: MESSAGE_TYPES.PAYMENT_AUTHORIZED,
    label: "Payment Authorized",
    description: "Sent to the traveler when their card payment is authorized",
    category: "business",
    audience: "customer",
    defaultPrimaryChannel: NOTIFICATION_CHANNELS[0],
    defaultFallbackChannel: NOTIFICATION_CHANNELS[1],
  },
  {
    messageType: MESSAGE_TYPES.BOOKING_CANCELLED_CUSTOMER,
    label: "Booking Cancelled (Traveler)",
    description: "Sent to the traveler when their booking is cancelled",
    category: "business",
    audience: "customer",
    defaultPrimaryChannel: NOTIFICATION_CHANNELS[0],
    defaultFallbackChannel: NOTIFICATION_CHANNELS[1],
  },
];

export const isCustomerMessageType = (
  audience?: MessageAudience | string
): boolean => audience === "customer";
