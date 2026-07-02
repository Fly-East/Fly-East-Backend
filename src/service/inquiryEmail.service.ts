import logger from "../utils/logger";
import { sendEmail, getEmailConfig } from "../modules/email";
import { inquiryNotificationTemplate } from "../mailtemplate";
import Package from "../models/package.model";
import { InquiryDocument } from "../models/inquery.model";

type InquiryEmailPayload = Pick<
  InquiryDocument,
  "name" | "email" | "phone" | "message" | "source" | "package"
> & {
  inquiryId?: string;
  createdAt?: Date;
};

const resolvePackageName = async (
  packageId?: InquiryDocument["package"]
): Promise<string | null> => {
  if (!packageId) return null;

  try {
    const packageDoc = await Package.findById(packageId).select("name").lean();
    return packageDoc?.name ?? null;
  } catch (error) {
    logger.warn("Unable to resolve package name for inquiry email", error);
    return null;
  }
};

export const sendInquiryNotification = async (
  inquiry: InquiryEmailPayload
): Promise<void> => {
  const config = getEmailConfig();
  const packageName = await resolvePackageName(inquiry.package);

  const html = inquiryNotificationTemplate({
    inquiryId: inquiry.inquiryId,
    leadName: inquiry.name,
    leadEmail: inquiry.email,
    leadPhone: inquiry.phone,
    leadMessage: inquiry.message,
    packageName,
    source: inquiry.source,
    createdAt: inquiry.createdAt,
  });

  await sendEmail({
    to: config.supportEmail,
    subject: "New Inquiry",
    html,
  });
};
