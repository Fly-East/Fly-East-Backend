// models/Visit.js
import mongoose from "mongoose";

const visitSchema = new mongoose.Schema({
  ip: String,
  path: String,
  city: String,
  region: String,
  country: String,
  latitude: Number,
  longitude: Number,
  userAgent: String,
  referer: String,
  acceptLanguage: String,
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.models.Visit || mongoose.model("Visit", visitSchema);
