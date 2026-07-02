import { model, Schema, Document, Types } from "mongoose";
import logger from "../utils/logger";

export interface IFixedDate extends Document {
  package: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  status: "Open" | "Closed" | "Booked";
  numberOfPerson: number;
  pricePerPerson: number;
  availableSeats: number;
  createdAt: Date;
  updatedAt: Date;
  sortOrder: number;

  // Check if there are enough available seats
  hasAvailableSeats(requiredSeats: number): boolean;
  // Reserve seats (returns true if successful)
  reserveSeats(requiredSeats: number): Promise<boolean>;
  // Release seats (for cancellations)
  releaseSeats(seats: number): Promise<void>;
}

const FixedDateSchema = new Schema<IFixedDate>(
  {
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: [true, "Package reference is required"],
      index: true,
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
      validate: {
        validator: function (this: IFixedDate, v: Date) {
          return v > this.startDate;
        },
        message: "End date must be after start date",
      },
    },
    status: {
      type: String,
      enum: ["Open", "Closed", "Booked"],
      required: [true, "Status is required"],
      default: "Open",
    },
    numberOfPerson: {
      type: Number,
      required: [true, "Number of persons is required"],
      min: [1, "Minimum 1 person required"],
    },
    pricePerPerson: {
      type: Number,
      required: [true, "Price per person is required"],
      min: [0, "Price cannot be negative"],
    },
    availableSeats: {
      type: Number,
      required: [true, "Available seats is required"],
      min: [0, "Available seats cannot be negative"],
      default: function () {
        return (this as any).numberOfPerson;
      },
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
FixedDateSchema.index({ package: 1, startDate: 1 });
FixedDateSchema.index({ startDate: 1, endDate: 1 });
FixedDateSchema.index({ status: 1 });

// Add instance methods
FixedDateSchema.methods.hasAvailableSeats = function (
  requiredSeats: number
): boolean {
  return this.availableSeats >= requiredSeats;
};

FixedDateSchema.methods.reserveSeats = async function (
  requiredSeats: number
): Promise<boolean> {
  if (this.availableSeats >= requiredSeats) {
    this.availableSeats -= requiredSeats;

    if (this.availableSeats <= 0) {
      this.availableSeats = 0;
      this.status = "Closed";
      logger.info(
        `All seats booked for fixed date ${this._id}, status set to 'Closed'`
      );
    } else {
      this.status = "Open";
    }

    await this.save();
    return true;
  }
  logger.warn(
    `Not enough seats available. Requested: ${requiredSeats}, Available: ${this.availableSeats}`
  );
  return false;
};

FixedDateSchema.methods.releaseSeats = async function (
  seats: number
): Promise<void> {
  this.availableSeats = Math.min(
    this.availableSeats + seats,
    this.numberOfPerson
  );

  // Update status if seats become available
  if (this.availableSeats > 0) {
    this.status = "Open";
  } else {
    this.status = "Closed";
  }

  await this.save();
};

const FixedDate = model<IFixedDate>("FixedDate", FixedDateSchema);
export default FixedDate;
