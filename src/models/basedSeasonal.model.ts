import mongoose, { Schema, model, Document } from "mongoose";

export interface SeasonalTrekDocument extends Document {
  title: string;
  description?: string;
  package: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const seasonalTrekSchema = new Schema<SeasonalTrekDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
  },
  { timestamps: true }
);

const SeasonalTrek =
  mongoose.models.SeasonalTrek ||
  model<SeasonalTrekDocument>("SeasonalTrek", seasonalTrekSchema);

export default SeasonalTrek;
