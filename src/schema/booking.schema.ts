import { object, string, number, boolean, date, array, TypeOf } from "zod";

const payload = {
  body: object({
    fullName: string({
      required_error: "Full name is required",
    }),

    phone: number({
      required_error: "Phone number is required",
    }),

    postalCode: number({
      required_error: "Postal code is required",
    }),

    dob: date({
      required_error: "Date of birth is required",
    }),

    startDate: date({
      required_error: "Start date is required",
    }),

    endDate: date({
      required_error: "End date is required",
    }),

    totalPeople: number().optional(),

    note: string().optional(),

    invoiceSent: boolean().default(false),

    paymentMethod: string().optional(),

    paymentStatus: string().optional(),
    emergencyName: string().optional(),

    emergencyPhone: number().optional(),

    emergencyRelationship: string().optional(),

    paymentId: string().optional(),

    totalAmount: number().optional(),
    type: string().optional(),
    depositAmount: number().optional(),

    remainingAmount: number().optional(),

    additionalServices: array(string()).optional(),

    // expedition: string({
    //   required_error: "Expedition is required",
    // }),

    expedition: string().optional(),
    departure: string().optional(),
    activity: string().optional(),
    training: string().optional(),
    user: string({
      required_error: "User is required",
    }),
  }),
};

const params = {
  params: object({
    bookingId: string({
      required_error: "Booking ID is required",
    }),
  }),
};

export const createBookingSchema = object({
  ...payload,
});

export const updateBookingSchema = object({
  ...payload,
  ...params,
});

export const deleteBookingSchema = object({
  ...params,
});

export const getBookingSchema = object({
  ...params,
});

export type CreateBookingInput = TypeOf<typeof createBookingSchema>;
export type UpdateBookingInput = TypeOf<typeof updateBookingSchema>;
export type ReadBookingInput = TypeOf<typeof getBookingSchema>;
export type DeleteBookingInput = TypeOf<typeof deleteBookingSchema>;
