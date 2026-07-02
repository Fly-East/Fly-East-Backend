import {
  bookingConfirmationOwnerTemplate,
  bookingConfirmationTravelerTemplate,
} from "./bookingConfirmation";
import { bookingInvoiceTemplate } from "./bookingInvoice";
import { bookingReplyTemplate } from "./bookingReply";
import { customBookingReplyTemplate } from "./customBookingReply";
import { detailedItineraryTemplate } from "./detailedItinerary";
import { forgotPasswordTemplate } from "./forgotPassword";
import { inquiryNotificationTemplate } from "./inquiryNotification";
import { inquiryReplyTemplate } from "./inquiryReply";
import { contactReplyTemplate } from "./contactReply";

export {
  bookingConfirmationOwnerTemplate,
  bookingConfirmationTravelerTemplate,
  bookingInvoiceTemplate,
  bookingReplyTemplate,
  customBookingReplyTemplate,
  detailedItineraryTemplate,
  forgotPasswordTemplate,
  contactReplyTemplate,
  inquiryNotificationTemplate,
  inquiryReplyTemplate,
};

export const renderMailTemplate = (
  templateName: string,
  data: Record<string, unknown> = {}
): string => {
  switch (templateName) {
    case "invoices/booking-invoice":
      return bookingInvoiceTemplate(data as any);
    case "inquiries/new-inquiry":
      return inquiryNotificationTemplate(data as any);
    default:
      throw new Error(`Unknown email template: ${templateName}`);
  }
};
