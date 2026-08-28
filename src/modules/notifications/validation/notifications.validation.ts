import { object, string, boolean, enum as zodEnum } from "zod";
import {
  MESSAGE_TYPE_VALUES,
  NOTIFICATION_CHANNELS,
  WHATSAPP_STATUSES,
} from "../constants/messageType.constants";

const channelEnum = zodEnum(
  NOTIFICATION_CHANNELS as unknown as [string, ...string[]]
);
const messageTypeEnum = zodEnum(
  MESSAGE_TYPE_VALUES as unknown as [string, ...string[]]
);
const whatsappStatusEnum = zodEnum(
  WHATSAPP_STATUSES as unknown as [string, ...string[]]
);

const contactBody = object({
  name: string({ required_error: "Name is required" }).min(1),
  email: string().email().optional().or(string().length(0)),
  phoneNumber: string().optional(),
  isActive: boolean().optional(),
  notes: string().optional(),
});

export const createContactPersonSchema = object({
  body: contactBody.refine(
    (data) => Boolean(data.email || data.phoneNumber),
  { message: "At least one of email or phoneNumber is required" }
  ),
});

export const updateContactPersonSchema = object({
  params: object({
    contactId: string({ required_error: "contactId is required" }),
  }),
  body: contactBody.partial(),
});

export const contactIdParamSchema = object({
  params: object({
    contactId: string({ required_error: "contactId is required" }),
  }),
});

export const updateMessageTypeSchema = object({
  params: object({
    messageType: messageTypeEnum,
  }),
  body: object({
    isEnabled: boolean().optional(),
    label: string().optional(),
    description: string().optional(),
  }),
});

export const createSubscriptionSchema = object({
  body: object({
    messageType: messageTypeEnum,
    contactPersonId: string({ required_error: "contactPersonId is required" }),
    primaryChannel: channelEnum,
    fallbackChannel: channelEnum.nullable().optional(),
    isEnabled: boolean().optional(),
  }),
});

export const updateSubscriptionSchema = object({
  params: object({
    subscriptionId: string({ required_error: "subscriptionId is required" }),
  }),
  body: object({
    primaryChannel: channelEnum.optional(),
    fallbackChannel: channelEnum.nullable().optional(),
    isEnabled: boolean().optional(),
  }),
});

export const subscriptionIdParamSchema = object({
  params: object({
    subscriptionId: string({ required_error: "subscriptionId is required" }),
  }),
});

export const testNotificationSchema = object({
  params: object({
    messageType: messageTypeEnum,
  }),
});

export const listLogsQuerySchema = object({
  query: object({
    page: string().optional(),
    limit: string().optional(),
    messageType: messageTypeEnum.optional(),
    status: string().optional(),
  }),
});

export const listSubscriptionsQuerySchema = object({
  query: object({
    messageType: messageTypeEnum.optional(),
    contactPersonId: string().optional(),
  }),
});

export const updateWhatsappStatusSchema = object({
  body: object({
    phoneNumber: string(),
    status: whatsappStatusEnum,
    errorCode: string().optional(),
  }),
});
