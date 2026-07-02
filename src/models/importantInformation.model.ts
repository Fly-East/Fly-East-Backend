import mongoose, { Schema, model, Document } from "mongoose";

export interface ImportantInformationDocument extends Document {
  category: string;
  title: string;
  description?: string;
  package: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const importantInformationSchema = new Schema<ImportantInformationDocument>(
  {
    // category: {
    //   type: String,
    //   required: true,
    //   trim: true,
    // },
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
  {
    timestamps: true,
  }
);

const ImportantInformation =
  mongoose.models.ImportantInformation ||
  model<ImportantInformationDocument>(
    "ImportantInformation",
    importantInformationSchema
  );

export default ImportantInformation;
