import { ADMIN_EMAIL, SUPPORT_EMAIL } from "../../../configs/env";
import logger from "../../../utils/logger";
import {
  MESSAGE_TYPE_DEFINITIONS,
  MESSAGE_TYPES,
  NOTIFICATION_CHANNELS,
} from "../constants/messageType.constants";
import ContactPerson from "../model/contactPerson.model";
import MessageTypeConfig from "../model/messageTypeConfig.model";
import NotificationSubscription from "../model/notificationSubscription.model";

const upsertMessageTypes = async (): Promise<void> => {
  for (const definition of MESSAGE_TYPE_DEFINITIONS) {
    await MessageTypeConfig.findOneAndUpdate(
      { messageType: definition.messageType },
      {
        $set: {
          label: definition.label,
          description: definition.description,
          category: definition.category,
          audience: definition.audience,
        },
        $setOnInsert: {
          isEnabled: true,
          ...(definition.defaultPrimaryChannel
            ? { primaryChannel: definition.defaultPrimaryChannel }
            : {}),
          ...(definition.defaultFallbackChannel !== undefined
            ? { fallbackChannel: definition.defaultFallbackChannel }
            : {}),
        },
      },
      { upsert: true, new: true }
    );

    if (definition.audience === "customer" && definition.defaultPrimaryChannel) {
      await MessageTypeConfig.updateOne(
        {
          messageType: definition.messageType,
          $or: [
            { primaryChannel: { $exists: false } },
            { primaryChannel: null },
          ],
        },
        {
          $set: {
            primaryChannel: definition.defaultPrimaryChannel,
            fallbackChannel: definition.defaultFallbackChannel ?? null,
          },
        }
      );
    }
  }
};

const seedDefaultContactsAndSubscriptions = async (): Promise<void> => {
  const existingCount = await ContactPerson.countDocuments();
  if (existingCount > 0) {
    return;
  }

  const contacts: Array<{ name: string; email?: string }> = [];

  if (SUPPORT_EMAIL) {
    contacts.push({ name: "Support", email: SUPPORT_EMAIL });
  }

  if (ADMIN_EMAIL && ADMIN_EMAIL !== SUPPORT_EMAIL) {
    contacts.push({ name: "Admin", email: ADMIN_EMAIL });
  }

  if (contacts.length === 0) {
    logger.warn(
      "Notification seed skipped default contacts: set SUPPORT_EMAIL or ADMIN_EMAIL"
    );
    return;
  }

  const createdContacts = await ContactPerson.insertMany(
    contacts.map((contact) => ({
      ...contact,
      isActive: true,
      whatsappStatus: "unknown",
    }))
  );

  const supportContact =
    createdContacts.find((c) => c.email === SUPPORT_EMAIL) ??
    createdContacts[0];
  const adminContact =
    createdContacts.find((c) => c.email === ADMIN_EMAIL) ?? supportContact;

  const subscriptions = [
    {
      messageType: MESSAGE_TYPES.NEW_INQUIRY,
      contactPersonId: supportContact._id,
      primaryChannel: NOTIFICATION_CHANNELS[0],
      isEnabled: true,
    },
    {
      messageType: MESSAGE_TYPES.NEW_CONTACT_LEAD,
      contactPersonId: supportContact._id,
      primaryChannel: NOTIFICATION_CHANNELS[0],
      isEnabled: true,
    },
    {
      messageType: MESSAGE_TYPES.NEW_LEAD,
      contactPersonId: supportContact._id,
      primaryChannel: NOTIFICATION_CHANNELS[0],
      isEnabled: true,
    },
    {
      messageType: MESSAGE_TYPES.SYSTEM_ERROR,
      contactPersonId: adminContact._id,
      primaryChannel: NOTIFICATION_CHANNELS[0],
      isEnabled: true,
    },
  ];

  for (const subscription of subscriptions) {
    await NotificationSubscription.findOneAndUpdate(
      {
        messageType: subscription.messageType,
        contactPersonId: subscription.contactPersonId,
        primaryChannel: subscription.primaryChannel,
      },
      { $setOnInsert: subscription },
      { upsert: true }
    );
  }

  logger.info("Notification default contacts and subscriptions seeded");
};

export const seedNotificationConfig = async (): Promise<void> => {
  try {
    await upsertMessageTypes();
    await seedDefaultContactsAndSubscriptions();
  } catch (error) {
    logger.error("Failed to seed notification config", error);
  }
};
