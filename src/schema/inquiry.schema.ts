import { object, string, TypeOf, z } from "zod";

const payload = {
  body: object({
    name: string({
      required_error: "Name is required",
    }),
    email: string({
      required_error: "Email is required",
    }).email("Email is not valid"),
    phone: string().optional(),
    message: string().optional(),
    package: string().optional(),
    status: z.enum(["pending", "contacted", "closed"]).optional(),
    source: string().optional(),
  }),
};

const params = {
  params: object({
    inquiryId: string({
      required_error: "inquiryId is required",
    }),
  }),
};

export const createInquirySchema = object({
  ...payload,
});

export const updateInquirySchema = object({
  ...payload,
  ...params,
});

export const deleteInquirySchema = object({
  ...params,
});

export const getInquirySchema = object({
  ...params,
});

export type CreateInquiryInput = TypeOf<typeof createInquirySchema>["body"];
export type UpdateInquiryInput = TypeOf<typeof updateInquirySchema>;
export type DeleteInquiryInput = TypeOf<typeof deleteInquirySchema>;
export type GetInquiryInput = TypeOf<typeof getInquirySchema>;
