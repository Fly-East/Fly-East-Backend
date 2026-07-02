import { Request, Response } from "express";
import mongoose from "mongoose";
import InquiryReply, {
  InquiryReplyStatus,
} from "../models/inquiryReply.model";
import Inquiry, { InquiryDocument } from "../models/inquery.model";
import { inquiryReplyTemplate } from "../mailtemplate";
import { sendEmail } from "../utils/sendMail";
import logger from "../utils/logger";
import { clearCacheByPrefix } from "../utils/redis";

type InquiryReplyRequestBody = {
  message?: string;
  subject?: string;
  status?: InquiryReplyStatus;
};

export const createInquiryReply = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { inquiryId } = req.params;
    const { message, subject, status } = req.body as InquiryReplyRequestBody;

    if (!message || !subject) {
      return res.status(400).json({
        success: false,
        message: "subject and message are required",
      });
    }

    const inquiry =
      (await Inquiry.findOne({ inquiryId })
        .populate("package", "name")
        .session(session)) as (InquiryDocument & {
        package?: { name?: string };
      }) | null;

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found",
      });
    }

    const reply = await InquiryReply.create(
      [
        {
          inquiry: inquiry._id,
          recipients: [inquiry.email],
          subject,
          message,
          status: status ?? inquiry.status,
        },
      ],
      { session }
    );

    if (status) {
      inquiry.status = status;
      await inquiry.save({ session });
    }

    const packageName = inquiry.package?.name ?? null;
    const subjectLine = packageName ? `${subject} - ${packageName}` : subject;

    const emailMessage = inquiryReplyTemplate({
      recipientName: inquiry.name,
      packageName,
      message,
      subject,
    });

    await sendEmail([inquiry.email], subjectLine, emailMessage);

    await session.commitTransaction();
    session.endSession();

    await clearCacheByPrefix("");

    return res.status(201).json({
      success: true,
      message: "Reply saved and email sent",
      data: reply,
    });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    logger.error("Error creating inquiry reply:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

export const getInquiryReplies = async (req: Request, res: Response) => {
  try {
    const { inquiryId } = req.params;

    const inquiry = await Inquiry.findOne({ inquiryId });
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found",
      });
    }

    const replies = await InquiryReply.find({ inquiry: inquiry._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: replies,
    });
  } catch (error: any) {
    logger.error("Error fetching inquiry replies:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};
