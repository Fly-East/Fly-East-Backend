import express from "express";
import { isAdmin } from "../middleware/isAdmin";
import { validate } from "../middleware/validate";
import { createInquiryHandler, deleteInquiryHandler, deleteManyInquiryHandler, getAllInquiryHandler, getInquiryHandler, updateInquiryHandler } from "../controller/inquiry.controller";
import { createInquirySchema, deleteInquirySchema, getInquirySchema } from "../schema/inquiry.schema";

const router = express.Router();
router.post("/api/v1/inquiry/multiple-delete",deleteManyInquiryHandler)

router.post("/api/v1/inquiry", [ validate(createInquirySchema)], createInquiryHandler);

router.patch("/api/v1/inquiry/:inquiryId",  updateInquiryHandler);

router.get("/api/v1/inquiry/:inquiryId", [validate(getInquirySchema),isAdmin], getInquiryHandler);

router.get("/api/v1/inquiry/",[isAdmin], getAllInquiryHandler);

router.delete("/api/v1/inquiry/:inquiryId", [ validate(deleteInquirySchema),isAdmin], deleteInquiryHandler);

export default router;
