import mongoose, { Document, Schema } from "mongoose";

export interface IContact extends Document {
  name: string;
  email: string;
  company: string;
  budget: string;
  goal: string;
  message: string;
  number: string;
  travelDate: string;
  source: string;
  status?: "pending" | "contacted" | "closed";
  seen: boolean;
  createdAt: Date;
  updatedAt: Date;
}


const contactSchema = new Schema<IContact>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
    },
   
    company: {
      type: String,
      trim: true,
    },
    budget: {
      type: String,
      trim: true,
    },
    goal: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
    },
    number: {
      type: String,
      trim: true,
    },
    travelDate: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "contacted", "closed"],
      default: "pending",
    },
    seen: {
      type: Boolean,
      default: false,
    },
    
  },
  { timestamps: true }
);

const Contact = mongoose.model<IContact>('Contact', contactSchema);

export default Contact;
