import mongoose from "mongoose";

export interface BlogInput {
  title: string;
  slug: string;
  banner?: string;
  description?: string;
  sortOrder?: number;
  estimatedReadTime?: number; // in minutes
  author?: string;
  isActive?: boolean;
}

export interface BlogDocument extends BlogInput, mongoose.Document {
  createdAt: Date;
  updatedAt: Date;
}

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, unique: true },
    banner: { type: String, default: "" },
    description: { type: String, default: "" },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    estimatedReadTime: {
      type: Number,
      default: 5, // Default to 5 minutes
      min: 1,
    },
    author: {
      type: String,
      default: "Admin",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

blogSchema.pre("save", async function (next) {
  const blog = this as BlogDocument;

  const slug = blog.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  blog.slug = slug;

  next();
});

const BlogModel = mongoose.model<BlogDocument>("Blog", blogSchema);

export default BlogModel;
