import { buildBaseEmail } from "./baseTemplate";
import type { BookingQuotePublicView } from "../service/bookingQuote.service";

export interface FinalQuoteEmailData {
  recipientName: string;
  publicView: BookingQuotePublicView;
  quoteUrl: string;
  bookingReference: string;
}

function coverList(
  items: Array<{ name: string; quantity: number }>
): string {
  if (!items.length) return "";
  return items
    .map(
      (item) =>
        `<li style="margin: 4px 0;">${item.name}${
          item.quantity > 1 ? ` × ${item.quantity}` : ""
        }</li>`
    )
    .join("");
}

export const finalQuoteEmailTemplate = (data: FinalQuoteEmailData): string => {
  const { publicView, recipientName, quoteUrl, bookingReference } = data;
  const { covers } = publicView;
  const includedHtml = coverList(covers.included);
  const selectedHtml = coverList(covers.selected);

  const body = `
    <p style="font-size: 16px; margin-bottom: 8px;">Dear <strong>${recipientName}</strong>,</p>
    <p style="font-size: 15px; line-height: 1.6;">
      We’ve reviewed your booking request for <strong>${covers.packageName}</strong>
      (ref. ${bookingReference}) and prepared a finalized quote.
    </p>
    <p style="font-size: 15px; line-height: 1.6;">
      ${covers.travelers} traveler${covers.travelers === 1 ? "" : "s"} ·
      ${covers.tripDays} trip day${covers.tripDays === 1 ? "" : "s"} ·
      ${covers.peopleOnTrip} people on this trip
    </p>
    ${
      includedHtml
        ? `<p style="font-weight: 600; margin: 16px 0 6px;">Included</p><ul>${includedHtml}</ul>`
        : ""
    }
    ${
      selectedHtml
        ? `<p style="font-weight: 600; margin: 16px 0 6px;">Selected add-ons</p><ul>${selectedHtml}</ul>`
        : ""
    }
    <p style="font-size: 18px; margin-top: 20px;">
      ${
        publicView.subtotal != null
          ? `Subtotal: <strong>$${Number(publicView.subtotal).toLocaleString()}</strong><br/>`
          : ""
      }
      ${
        (publicView.vatAmount ?? 0) > 0
          ? `VAT (${publicView.vatPercent ?? 0}%): <strong>$${Number(publicView.vatAmount).toLocaleString()}</strong><br/>`
          : ""
      }
      ${
        (publicView.transactionChargeAmount ?? 0) > 0
          ? `Transaction charge (${publicView.transactionChargePercent ?? 0}%): <strong>$${Number(publicView.transactionChargeAmount).toLocaleString()}</strong><br/>`
          : ""
      }
      Total: <strong>$${(publicView.grandTotal ?? publicView.totalAmount).toLocaleString()}</strong>
    </p>
    <p style="margin-top: 24px;">
      <a href="${quoteUrl}" style="display: inline-block; padding: 12px 24px; background: #059669; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">
        View your quote
      </a>
    </p>
    <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">
      If the button doesn’t work, copy this link:<br/>
      ${quoteUrl}
    </p>
  `;

  return buildBaseEmail({
    title: "Your finalized quote",
    bodyHtml: body,
  });
};
