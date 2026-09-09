import { Request, Response, NextFunction } from "express";
import ContactPerson from "../model/contactPerson.model";
import MessageTypeConfig from "../model/messageTypeConfig.model";
import NotificationLog from "../model/notificationLog.model";
import NotificationSubscription from "../model/notificationSubscription.model";
import { MessageType } from "../constants/messageType.constants";
import { listNotificationChannels } from "../channels/channel.registry";
import { NotificationService } from "../service/notification.service";
import { handleWhatsAppStatusWebhook } from "../service/whatsapp.webhook.service";

export const listContactPersons = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const contacts = await ContactPerson.find().sort({ createdAt: -1 }).lean();
    res.json({ status: "success", data: contacts });
  } catch (error) {
    next(error);
  }
};

export const createContactPerson = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const contact = await ContactPerson.create(req.body);
    res.status(201).json({ status: "success", data: contact });
  } catch (error) {
    next(error);
  }
};

export const updateContactPerson = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const contact = await ContactPerson.findByIdAndUpdate(
      req.params.contactId,
      req.body,
      { new: true, runValidators: true }
    );

    if (!contact) {
      return res.status(404).json({ status: "fail", message: "Contact not found" });
    }

    res.json({ status: "success", data: contact });
  } catch (error) {
    next(error);
  }
};

export const deleteContactPerson = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const contact = await ContactPerson.findByIdAndDelete(req.params.contactId);
    if (!contact) {
      return res.status(404).json({ status: "fail", message: "Contact not found" });
    }

    await NotificationSubscription.deleteMany({
      contactPersonId: contact._id,
    });

    res.json({ status: "success", message: "Contact deleted" });
  } catch (error) {
    next(error);
  }
};

export const listMessageTypes = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const types = await MessageTypeConfig.find().sort({ category: 1, label: 1 }).lean();
    res.json({ status: "success", data: types });
  } catch (error) {
    next(error);
  }
};

export const listNotificationChannelsHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    res.json({ status: "success", data: listNotificationChannels() });
  } catch (error) {
    next(error);
  }
};

export const updateMessageType = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const type = await MessageTypeConfig.findOneAndUpdate(
      { messageType: req.params.messageType },
      req.body,
      { new: true }
    );

    if (!type) {
      return res.status(404).json({ status: "fail", message: "Message type not found" });
    }

    res.json({ status: "success", data: type });
  } catch (error) {
    next(error);
  }
};

export const listSubscriptions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.messageType) filter.messageType = req.query.messageType;
    if (req.query.contactPersonId) filter.contactPersonId = req.query.contactPersonId;

    const subscriptions = await NotificationSubscription.find(filter)
      .populate("contactPersonId", "name email phoneNumber isActive")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ status: "success", data: subscriptions });
  } catch (error) {
    next(error);
  }
};

export const createSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const typeConfig = await MessageTypeConfig.findOne({
      messageType: req.body.messageType,
    }).lean();

    if (typeConfig?.audience === "customer") {
      return res.status(400).json({
        status: "fail",
        message:
          "Customer-facing message types use global channel settings, not contact subscriptions",
      });
    }

    const subscription = await NotificationSubscription.create(req.body);
    const populated = await subscription.populate(
      "contactPersonId",
      "name email phoneNumber isActive"
    );
    res.status(201).json({ status: "success", data: populated });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({
        status: "fail",
        message: "Subscription already exists for this contact and channel",
      });
    }
    next(error);
  }
};

export const updateSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const subscription = await NotificationSubscription.findByIdAndUpdate(
      req.params.subscriptionId,
      req.body,
      { new: true }
    ).populate("contactPersonId", "name email phoneNumber isActive");

    if (!subscription) {
      return res.status(404).json({ status: "fail", message: "Subscription not found" });
    }

    res.json({ status: "success", data: subscription });
  } catch (error) {
    next(error);
  }
};

export const deleteSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const subscription = await NotificationSubscription.findByIdAndDelete(
      req.params.subscriptionId
    );

    if (!subscription) {
      return res.status(404).json({ status: "fail", message: "Subscription not found" });
    }

    res.json({ status: "success", message: "Subscription deleted" });
  } catch (error) {
    next(error);
  }
};

export const listNotificationLogs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (req.query.messageType) filter.messageType = req.query.messageType;
    if (req.query.status) filter.status = req.query.status;

    const [logs, total] = await Promise.all([
      NotificationLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("contactPersonId", "name email")
        .lean(),
      NotificationLog.countDocuments(filter),
    ]);

    res.json({
      status: "success",
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const sendTestNotification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const messageType = req.params.messageType as MessageType;

    await NotificationService.dispatch(messageType, {
      test: true,
      message: `Test notification for ${messageType}`,
      triggeredAt: new Date().toISOString(),
      triggeredBy: (req as any).user?.email ?? "admin",
    });

    res.json({
      status: "success",
      message: `Test notification queued for ${messageType}`,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyWhatsAppWebhook = (
  req: Request,
  res: Response
): void => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
};

export const handleWhatsAppWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await handleWhatsAppStatusWebhook(req.body);
    res.sendStatus(200);
  } catch (error) {
    next(error);
  }
};
