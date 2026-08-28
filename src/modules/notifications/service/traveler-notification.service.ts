import Booking from "../../../models/booking.model";
import { MessageType } from "../constants/messageType.constants";
import { emitNotification } from "../emitter/notification.emitter";

export const notifyBookingTravelers = async (
  messageType: MessageType,
  bookingId: string,
  extra: Record<string, unknown> = {}
): Promise<void> => {
  const booking = await Booking.findById(bookingId)
    .select("personalInfo bookingReference quotePublicUrl package")
    .populate("package", "name")
    .lean();

  if (!booking) return;

  const packageName =
    booking.package && typeof booking.package === "object"
      ? (booking.package as { name?: string }).name
      : undefined;

  for (const person of booking.personalInfo || []) {
    if (!person?.email && !person?.phoneNumber) continue;

    emitNotification(messageType, {
      bookingId,
      bookingReference: booking.bookingReference,
      packageName,
      quoteUrl: booking.quotePublicUrl,
      customerEmail: person.email,
      customerName: person.fullName,
      customerPhone: person.phoneNumber,
      ...extra,
    });
  }
};
