import { Router } from "express";
import { checkPermissions, isAdmin } from "../../../middleware/isAdmin";
import { validate } from "../../../middleware/validate";
import {
  createContactPerson,
  createSubscription,
  deleteContactPerson,
  deleteSubscription,
  handleWhatsAppWebhook,
  listContactPersons,
  listMessageTypes,
  listNotificationChannelsHandler,
  listNotificationLogs,
  listSubscriptions,
  sendTestNotification,
  updateContactPerson,
  updateMessageType,
  updateSubscription,
  verifyWhatsAppWebhook,
} from "../controller/notifications.controller";
import {
  contactIdParamSchema,
  createContactPersonSchema,
  createSubscriptionSchema,
  listLogsQuerySchema,
  listSubscriptionsQuerySchema,
  subscriptionIdParamSchema,
  testNotificationSchema,
  updateContactPersonSchema,
  updateMessageTypeSchema,
  updateSubscriptionSchema,
} from "../validation/notifications.validation";

const router = Router();

router.get(
  "/api/v1/admin/notifications/contacts",
  isAdmin,
  listContactPersons
);

router.post(
  "/api/v1/admin/notifications/contacts",
  isAdmin,
  checkPermissions(["create"]),
  validate(createContactPersonSchema),
  createContactPerson
);

router.patch(
  "/api/v1/admin/notifications/contacts/:contactId",
  isAdmin,
  checkPermissions(["edit"]),
  validate(updateContactPersonSchema),
  updateContactPerson
);

router.delete(
  "/api/v1/admin/notifications/contacts/:contactId",
  isAdmin,
  checkPermissions(["delete"]),
  validate(contactIdParamSchema),
  deleteContactPerson
);

router.get(
  "/api/v1/admin/notifications/message-types",
  isAdmin,
  listMessageTypes
);

router.get(
  "/api/v1/admin/notifications/channels",
  isAdmin,
  listNotificationChannelsHandler
);

router.patch(
  "/api/v1/admin/notifications/message-types/:messageType",
  isAdmin,
  checkPermissions(["edit"]),
  validate(updateMessageTypeSchema),
  updateMessageType
);

router.get(
  "/api/v1/admin/notifications/subscriptions",
  isAdmin,
  validate(listSubscriptionsQuerySchema),
  listSubscriptions
);

router.post(
  "/api/v1/admin/notifications/subscriptions",
  isAdmin,
  checkPermissions(["create"]),
  validate(createSubscriptionSchema),
  createSubscription
);

router.patch(
  "/api/v1/admin/notifications/subscriptions/:subscriptionId",
  isAdmin,
  checkPermissions(["edit"]),
  validate(updateSubscriptionSchema),
  updateSubscription
);

router.delete(
  "/api/v1/admin/notifications/subscriptions/:subscriptionId",
  isAdmin,
  checkPermissions(["delete"]),
  validate(subscriptionIdParamSchema),
  deleteSubscription
);

router.get(
  "/api/v1/admin/notifications/logs",
  isAdmin,
  validate(listLogsQuerySchema),
  listNotificationLogs
);

router.post(
  "/api/v1/admin/notifications/test/:messageType",
  isAdmin,
  checkPermissions(["edit"]),
  validate(testNotificationSchema),
  sendTestNotification
);

router.get(
  "/api/v1/notifications/whatsapp/webhook",
  verifyWhatsAppWebhook
);

router.post(
  "/api/v1/notifications/whatsapp/webhook",
  handleWhatsAppWebhook
);

export default router;
