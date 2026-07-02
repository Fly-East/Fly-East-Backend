import { buildBaseEmail } from "./baseTemplate";
import { formatCurrency, renderKeyValueRows } from "./utils";

interface ContactInfo {
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  country?: string;
}

export interface BookingInvoiceData {
  bookingReference: string;
  invoiceNumber?: string;
  primaryContact?: ContactInfo;
  invoiceDate?: string;
  dueDate?: string;
  startDate?: string;
  endDate?: string;
  packageName?: string;
  duration?: string | number;
  totalPeople?: number;
  basePricePerPerson?: number;
  originalTotal?: number;
  discountPercentage?: number;
  discountAmount?: number;
  totalAmount?: number;
  status?: string;
}

export const bookingInvoiceTemplate = (data: BookingInvoiceData): string => {
  const summaryRows = renderKeyValueRows([
    { label: "Booking Reference", value: data.bookingReference },
    { label: "Invoice Date", value: data.invoiceDate },
    { label: "Due Date", value: data.dueDate },
    { label: "Package", value: data.packageName },
    { label: "Duration", value: data.duration?.toString() },
    { label: "Start Date", value: data.startDate },
    { label: "End Date", value: data.endDate },
    { label: "Travelers", value: data.totalPeople?.toString() },
    {
      label: "Base Price",
      value:
        data.basePricePerPerson !== undefined
          ? formatCurrency(data.basePricePerPerson)
          : undefined,
    },
    {
      label: "Original Total",
      value:
        data.originalTotal !== undefined
          ? formatCurrency(data.originalTotal)
          : undefined,
    },
    {
      label: "Discount",
      value:
        data.discountPercentage !== undefined
          ? `${data.discountPercentage}%`
          : undefined,
    },
    {
      label: "Discount Amount",
      value:
        data.discountAmount !== undefined
          ? formatCurrency(data.discountAmount)
          : undefined,
    },
    {
      label: "Total Amount",
      value:
        data.totalAmount !== undefined
          ? formatCurrency(data.totalAmount)
          : undefined,
    },
    { label: "Status", value: data.status },
  ]);

  const contactRows = renderKeyValueRows([
    { label: "Name", value: data.primaryContact?.fullName },
    { label: "Email", value: data.primaryContact?.email },
    { label: "Phone", value: data.primaryContact?.phoneNumber },
    { label: "Country", value: data.primaryContact?.country },
  ]);

  const body = `
    <div style="text-align: right; margin-bottom: 25px;">
      <p style="font-size: 28px; font-weight: 700; color: #DC2626; margin: 0; letter-spacing: 1px;">INVOICE</p>
      ${data.invoiceNumber ? `<p style="font-size: 14px; color: #374151; margin: 5px 0 0 0;">Invoice #: <strong>${data.invoiceNumber}</strong></p>` : ""}
      <p style="font-size: 14px; color: #6b7280; margin: 3px 0 0 0;">Booking Ref: <strong>${data.bookingReference}</strong></p>
    </div>
    
    <div style="margin-bottom: 30px; overflow: hidden;">
      <div style="float: left; width: 48%;">
        <p style="font-weight: 700; margin-bottom: 8px; color: #1f2937; font-size: 15px;">BILL TO:</p>
        ${data.primaryContact?.fullName ? `<p style="margin: 4px 0; font-size: 14px;">${data.primaryContact.fullName}</p>` : ""}
        ${data.primaryContact?.email ? `<p style="margin: 4px 0; font-size: 14px; color: #6b7280;">${data.primaryContact.email}</p>` : ""}
        ${data.primaryContact?.phoneNumber ? `<p style="margin: 4px 0; font-size: 14px; color: #6b7280;">${data.primaryContact.phoneNumber}</p>` : ""}
        ${data.primaryContact?.country ? `<p style="margin: 4px 0; font-size: 14px; color: #6b7280;">${data.primaryContact.country}</p>` : ""}
      </div>
      <div style="float: right; width: 48%; text-align: right;">
        <p style="font-weight: 700; margin-bottom: 8px; color: #1f2937; font-size: 15px;">INVOICE DETAILS:</p>
        ${data.invoiceDate ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Date:</strong> ${data.invoiceDate}</p>` : ""}
        ${data.dueDate ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Due:</strong> ${data.dueDate}</p>` : ""}
        ${data.status ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Status:</strong> <span style="color: #f59e0b; font-weight: 600;">${data.status}</span></p>` : ""}
      </div>
      <div style="clear: both;"></div>
    </div>
    
    <h3 style="background: #DC2626; color: white; padding: 12px 15px; margin: 25px 0 0 0; border-radius: 6px 6px 0 0; font-size: 16px;">Trip Details</h3>
    <table style="margin-top: 0;">
      <tbody>
        ${data.packageName ? `<tr><th>Package</th><td>${data.packageName}</td></tr>` : ""}
        ${data.duration ? `<tr><th>Duration</th><td>${data.duration}</td></tr>` : ""}
        ${data.startDate ? `<tr><th>Start Date</th><td>${data.startDate}</td></tr>` : ""}
        ${data.endDate ? `<tr><th>End Date</th><td>${data.endDate}</td></tr>` : ""}
        ${data.totalPeople ? `<tr><th>Number of Travelers</th><td>${data.totalPeople}</td></tr>` : ""}
      </tbody>
    </table>
    
    <h3 style="background: #DC2626; color: white; padding: 12px 15px; margin: 25px 0 0 0; border-radius: 6px 6px 0 0; font-size: 16px;">Payment Summary</h3>
    <table style="margin-top: 0;">
      <tbody>
        ${data.basePricePerPerson !== undefined ? `<tr><th>Base Price (per person)</th><td>${formatCurrency(data.basePricePerPerson)}</td></tr>` : ""}
        ${data.originalTotal !== undefined ? `<tr><th>Subtotal</th><td>${formatCurrency(data.originalTotal)}</td></tr>` : ""}
        ${data.discountPercentage !== undefined ? `<tr><th>Discount (${data.discountPercentage}%)</th><td style="color: #059669; font-weight: 600;">-${data.discountAmount !== undefined ? formatCurrency(data.discountAmount) : ""}</td></tr>` : ""}
        ${data.totalAmount !== undefined ? `<tr style="background: #fef3c7; border-top: 2px solid #DC2626;"><th style="font-size: 17px; font-weight: 700; background: #fef3c7; padding: 15px;">TOTAL AMOUNT DUE</th><td style="font-size: 20px; font-weight: 700; color: #DC2626; background: #fef3c7; padding: 15px;">${formatCurrency(data.totalAmount)}</td></tr>` : ""}
      </tbody>
    </table>
    
    <div style="margin-top: 30px; padding: 20px; background: #ffffff; border: 2px solid #e5e7eb; border-radius: 8px;">
      <p style="margin: 0 0 12px 0; font-weight: 700; color: #1f2937; font-size: 16px;">Payment Instructions</p>
      <p style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.6; color: #374151;">
        Please ensure payment is made by the due date to confirm your booking.
      </p>
      <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
        For payment methods, bank details, or any questions regarding this invoice, please contact our billing department at <a href="mailto:billing@flyeastnepal.com" style="color: #DC2626; text-decoration: none; font-weight: 600;">billing@flyeastnepal.com</a>
      </p>
    </div>
    
    <p style="margin-top: 30px; font-size: 13px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px;">
      Thank you for choosing Fly East Nepal. We look forward to serving you!
    </p>
  `;

  return buildBaseEmail({
    title: "Booking Invoice",
    bodyHtml: body,
  });
};
