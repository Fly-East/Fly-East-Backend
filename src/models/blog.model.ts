
// import mongoose from "mongoose";

// // Video interface
// export interface BlogVideo {
//   title?: string;
//   url: string;
//   type: "upload" | "youtube" | "external";
// }

// // FAQ interface
// export interface BlogFAQ {
//   question: string;
//   answer: string;
// }

// // Blog input interface
// export interface BlogInput {
//   title: string;
//   slug: string;
//   banner?: string;
//   description?: string;
//   sortOrder?: number;
//   estimatedReadTime?: number;
//   author?: string;
//   isActive?: boolean;

//   // Multiple gallery images
//   gallery?: string[];

//   // Multiple videos
//   videos?: BlogVideo[];

//   // Multiple FAQs
//   faqs?: BlogFAQ[];

//   // Related packages
//   relatedPackages?: mongoose.Types.ObjectId[];
// }

// // Blog document interface
// export interface BlogDocument extends BlogInput, mongoose.Document {
//   createdAt: Date;
//   updatedAt: Date;
// }

// // Video sub-schema
// const blogVideoSchema = new mongoose.Schema<BlogVideo>(
//   {
//     title: {
//       type: String,
//       default: "",
//     },
//     url: {
//       type: String,
//       required: true,
//     },
//     type: {
//       type: String,
//       enum: ["upload", "youtube", "external"],
//       required: true,
//     },
//   },
//   { _id: true }
// );

// // FAQ sub-schema
// const blogFAQSchema = new mongoose.Schema<BlogFAQ>(
//   {
//     question: {
//       type: String,
//       required: true,
//       trim: true,
//     },
//     answer: {
//       type: String,
//       required: true,
//       trim: true,
//     },
//   },
//   { _id: true }
// );

// // Main blog schema
// const blogSchema = new mongoose.Schema(
//   {
//     title: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     slug: {
//       type: String,
//       unique: true,
//       index: true,
//     },

//     banner: {
//       type: String,
//       default: "",
//     },

//     description: {
//       type: String,
//       default: "",
//     },

//     // Multiple gallery image URLs
//     gallery: {
//       type: [String],
//       default: [],
//     },

//     // Multiple videos
//     videos: {
//       type: [blogVideoSchema],
//       default: [],
//     },

//     // Multiple FAQs
//     faqs: {
//       type: [blogFAQSchema],
//       default: [],
//     },

//     // References to existing Package documents
//     relatedPackages: [
//       {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Package",
//       },
//     ],

//     sortOrder: {
//       type: Number,
//       default: 0,
//       index: true,
//     },

//     estimatedReadTime: {
//       type: Number,
//       default: 5,
//       min: 1,
//     },

//     author: {
//       type: String,
//       default: "Admin",
//     },

//     isActive: {
//       type: Boolean,
//       default: true,
//       index: true,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// // Generate slug only when creating a blog or changing its title.
// blogSchema.pre("save", function (next) {
//   const blog = this as BlogDocument;

//   if (blog.isNew || blog.isModified("title")) {
//     blog.slug = blog.title
//       .toLowerCase()
//       .replace(/[^a-z0-9]+/g, "-")
//       .replace(/^-|-$/g, "");
//   }

//   next();
// });

// const BlogModel = mongoose.model<BlogDocument>(
//   "Blog",
//   blogSchema
// );

// export default BlogModel;




import mongoose from "mongoose";

// Video interface
export interface BlogVideo {
  title?: string;
  url: string;
  type: "upload" | "youtube" | "external";
}

// FAQ interface
export interface BlogFAQ {
  question: string;
  answer: string;
}

// Blog input interface
export interface BlogInput {
  title: string;
  slug: string;
  banner?: string;
  description?: string;
  sortOrder?: number;
  estimatedReadTime?: number;
  author?: string;
  isActive?: boolean;
  gallery?: string[];
  videos?: BlogVideo[];
  faqs?: BlogFAQ[];
  relatedPackages?: mongoose.Types.ObjectId[];
  relatedArticles?: mongoose.Types.ObjectId[];
}

// Blog document interface
export interface BlogDocument extends BlogInput, mongoose.Document {
  createdAt: Date;
  updatedAt: Date;
}

// Video sub-schema
const blogVideoSchema = new mongoose.Schema<BlogVideo>(
  {
    title: {
      type: String,
      default: "",
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["upload", "youtube", "external"],
      required: true,
    },
  },
  { _id: true }
);

// FAQ sub-schema
const blogFAQSchema = new mongoose.Schema<BlogFAQ>(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: true }
);

// Main blog schema
const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    banner: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      default: "",
    },

    gallery: {
      type: [String],
      default: [],
    },

    videos: {
      type: [blogVideoSchema],
      default: [],
    },

    faqs: {
      type: [blogFAQSchema],
      default: [],
    },

    relatedPackages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Package",
      },
    ],

    // Related articles reference other Blog documents
    relatedArticles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Blog",
      },
    ],

    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },

    estimatedReadTime: {
      type: Number,
      default: 5,
      min: 1,
    },

    author: {
      type: String,
      default: "Admin",
      trim: true,
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

// Generate a URL-friendly slug
const generateBlogSlug = (value: string): string => {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

// Generate slug before validation.
// Preserve an explicitly provided slug.
blogSchema.pre("validate", function () {
  const blog = this as BlogDocument;

  if (!blog.slug && blog.title) {
    blog.slug = generateBlogSlug(blog.title);
  }

  if (!blog.slug) {
    throw new Error(
      "A valid slug is required. Please provide a slug or a title containing English characters."
    );
  }
});

// Blog model
const BlogModel = mongoose.model<BlogDocument>(
  "Blog",
  blogSchema
);

export default BlogModel;
