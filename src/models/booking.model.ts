import { Schema, model } from "mongoose";
import {
  BookingType,
  BookingStatus,
  PaymentStatus,
} from "../types/booking.type";

// Create the schema for Booking
const BookingSchema = new Schema<BookingType>(
  {
    bookingReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
      addons: [
      {
        type: Schema.Types.ObjectId,
        ref: "Addons",
      },
    ],
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: "pending",
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: "pending",
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
 
    currency: {
      type: String,
      required: true,
      default: "USD",
      uppercase: true,
      trim: true,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    totalPeople: {
      type: Number,
      required: true,
      min: 1,
    },

    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    fixedDate: {
      type: Schema.Types.ObjectId,
      ref: "FixedDate",
      required: true,
    },
    personalInfo: [
      {
        fullName: {
          type: String,
          required: true,
          trim: true,
        },
        email: {
          type: String,
          required: true,
          trim: true,
          lowercase: true,
          match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
        },
        country: {
          type: String,
          required: true,
          trim: true,
        },
        phoneNumber: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],

    arrivalDate: {
      type: Date,
      required: false,
    },
    departureDate: {
      type: Date,
      required: false,
      validate: {
        validator: function (this: any, value: Date) {
          if (!value || !this.arrivalDate) {
            return true;
          }
          return value > this.arrivalDate;
        },
        message: "Departure date must be after arrival date",
      },
    },
    message: {
      type: String,
      trim: false,
    },

    seen: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Add index for frequently queried fields
BookingSchema.index({ bookingReference: 1 }, { unique: true });
BookingSchema.index({ "personalInfo.email": 1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ paymentStatus: 1 });
BookingSchema.index({ arrivalDate: 1, departureDate: 1 });

// Create and export the model
const Booking = model<BookingType>("Booking", BookingSchema);
export default Booking;
