import { Request, Response } from "express";
import mongoose from "mongoose";
import Contact from "../models/contact.model";
import ContactReply, {
  ContactReplyStatus,
} from "../models/contactReply.model";
import { contactReplyTemplate } from "../mailtemplate";
import { sendEmail } from "../utils/sendMail";
import logger from "../utils/logger";
import { clearCacheByPrefix } from "../utils/redis";

type ContactReplyRequestBody = {
  message?: string;
  subject?: string;
  status?: ContactReplyStatus;
};

export const createContactReply = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { contactId } = req.params;
    const { message, subject, status } =
      req.body as ContactReplyRequestBody;

    if (!message || !subject) {
      return res.status(400).json({
        success: false,
        message: "subject and message are required",
      });
    }

    const contact = await Contact.findById(contactId).session(session);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    const reply = await ContactReply.create(
      [
        {
          contact: contact._id,
          recipients: [contact.email],
          subject,
          message,
          status: status ?? contact.status,
        },
      ],
      { session }
    );

    if (status) {
      contact.status = status;
      await contact.save({ session });
    }

    const emailMessage = contactReplyTemplate({
      recipientName: contact.name,
      message,
      subject,
    });

    await sendEmail([contact.email], subject, emailMessage);

    await session.commitTransaction();
    session.endSession();

    await clearCacheByPrefix("contacts:");
    await clearCacheByPrefix("");

    return res.status(201).json({
      success: true,
      message: "Reply saved and email sent",
      data: reply,
    });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    logger.error("Error creating contact reply:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

export const getContactReplies = async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    const contact = await Contact.findById(contactId);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    const replies = await ContactReply.find({ contact: contact._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: replies,
    });
  } catch (error: any) {
    logger.error("Error fetching contact replies:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};
