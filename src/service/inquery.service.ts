import { FilterQuery, QueryOptions, UpdateQuery } from "mongoose";
import InquiryModel, { InquiryDocument, InquiryInput } from "../models/inquery.model";

export async function createInquiry(input: InquiryInput) {
  const result = await InquiryModel.create(input);
  return result;
}

export async function findInquiry(query: FilterQuery<InquiryDocument>, options: QueryOptions = { lean: true }) {
  const result = await InquiryModel.findOne(query, {}, options);
  return result;
}

export async function findAndUpdateInquiry(query: FilterQuery<InquiryDocument>, update: UpdateQuery<InquiryDocument>, options: QueryOptions) {
  return InquiryModel.findOneAndUpdate(query, update, options);
}

export async function deleteInquiry(query: FilterQuery<InquiryDocument>) {
  return InquiryModel.deleteOne(query);
}

export async function findAllInquiry(
  query: FilterQuery<InquiryDocument> = {},
  options: { skip?: number; limit?: number; sort?: any } = {}
) {
  const { skip = 0, limit = 100, sort = { createdAt: -1 } } = options;
  
  const [total, data] = await Promise.all([
    InquiryModel.countDocuments(query),
    InquiryModel.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  return {
    data,
    total,
    skip,
    limit
  };
}

export async function deleteManyInquiry(query: FilterQuery<InquiryDocument>) {
  return InquiryModel.deleteMany(query);
}
