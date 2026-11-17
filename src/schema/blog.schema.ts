// import { object, number, string, TypeOf, any } from "zod";

// const payload = {
//   body: object({
//     title: string({
//       required_error: "title is required",
//     }),

//     slug: string({
//       required_error: "Slug is required",
//     }),

//     banner: string({
//       required_error: "Banner is required",
//     }),

//     description: string({
//       required_error: "description is required",
//     }),
   
//   }),
// };

// const params = {
//   params: object({
//     blogId: string({
//       required_error: "blogId is required",
//     }),
//   }),
// };

// export const createBlogSchema = object({
//   ...payload,
// });

// export const updateBlogSchema = object({
//   ...payload,
//   ...params,
// });

// export const deleteBlogSchema = object({
//   ...params,
// });

// export const getBlogSchema = object({
//   ...params,
// });

// export type CreateBlogInput = TypeOf<typeof createBlogSchema>;
// export type UpdateBlogInput = TypeOf<typeof updateBlogSchema>;
// export type ReadBlogInput = TypeOf<typeof getBlogSchema>;
// export type DeleteBlogInput = TypeOf<typeof deleteBlogSchema>;



import { object, number, string, TypeOf, array, boolean } from "zod";

const videoSchema = object({
  title: string().optional(),
  url: string().url("Invalid video URL"),
  type: string().refine(
    (value) => ["upload", "youtube", "external"].includes(value),
    "Invalid video type"
  ),
});

const faqSchema = object({
  question: string().min(1, "Question is required"),
  answer: string().min(1, "Answer is required"),
});

const payload = {
  body: object({
    title: string({ required_error: "Title is required" })
      .min(1, "Title is required"),

    slug: string().optional(),

    banner: string().optional(),

    description: string().optional(),

    gallery: array(string()).optional(),

    videos: array(videoSchema).optional(),

    faqs: array(faqSchema).optional(),

    relatedPackages: array(string()).optional(),

    sortOrder: number().optional(),

    estimatedReadTime: number().optional(),

    author: string().optional(),

    isActive: boolean().optional(),
  }),
};

const params = {
  params: object({
    blogId: string({
      required_error: "blogId is required",
    }),
  }),
};

export const createBlogSchema = object({
  ...payload,
});

export const updateBlogSchema = object({
  ...payload,
  ...params,
});

export const deleteBlogSchema = object({
  ...params,
});

export const getBlogSchema = object({
  ...params,
});

export type CreateBlogInput = TypeOf<typeof createBlogSchema>;
export type UpdateBlogInput = TypeOf<typeof updateBlogSchema>;
export type ReadBlogInput = TypeOf<typeof getBlogSchema>;
export type DeleteBlogInput = TypeOf<typeof deleteBlogSchema>;
