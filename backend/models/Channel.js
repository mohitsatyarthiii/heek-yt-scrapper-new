import mongoose from "mongoose";

const channelSchema = new mongoose.Schema(
  {
    channelId: { type: String, unique: true, index: true },
    title: String,
    description: String,
    subscribers: Number,
    views: Number,
    videos: Number,
    country: String,
    email: String,
  },
  { timestamps: true }
);

export default mongoose.model("Channel", channelSchema);