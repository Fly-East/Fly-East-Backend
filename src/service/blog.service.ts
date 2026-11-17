// import { FilterQuery, QueryOptions, UpdateQuery } from "mongoose";
// import BlogModel, { BlogInput, BlogDocument } from "../models/blog.model";

// export async function createBlog(input: BlogInput) {
//   const result = await BlogModel.create(input);
//   return result;
// }

// export async function findBlog(query: FilterQuery<BlogDocument>, options: QueryOptions = { lean: true }) {
//   const result = await BlogModel.findOne(query, {}, options);
//   return result;
// }

// export async function findAndUpdateBlog(query: FilterQuery<BlogDocument>, update: UpdateQuery<BlogDocument>, options: QueryOptions) {
//   return BlogModel.findOneAndUpdate(query, update, options);
// }

// export async function deleteBlog(query: FilterQuery<BlogDocument>) {
//   return BlogModel.deleteOne(query);
// }

// // export async function findAllBlog() {
// //   const result = await BlogModel.find().sort({ createdAt: -1 });
// //   return result;
// // }

// export async function findAllBlog(query: FilterQuery<BlogDocument>, options: QueryOptions = { lean: true }) {
//   const result = await BlogModel.find(query, {}, options).sort({ createdAt: -1 });
//   return result;
// }

// export async function findAllBlogForCard() {
//   const result = await BlogModel.find().select("title slug banner createdAt").sort({ createdAt: -1 });
//   return result;
// }

// export async function deleteManyBlog(query: FilterQuery<BlogDocument>) {
//   return BlogModel.deleteMany(query);
// }



import {
  FilterQuery,
  QueryOptions,
  UpdateQuery,
} from "mongoose";

import BlogModel, {
  BlogInput,
  BlogDocument,
} from "../models/blog.model";

// CREATE BLOG
export async function createBlog(input: BlogInput) {
  const blog = await BlogModel.create(input);
  return blog;
}

// FIND ONE BLOG
export async function findBlog(
  query: FilterQuery<BlogDocument>,
  options: QueryOptions = { lean: true }
) {
  return BlogModel.findOne(query, {}, options);
}

// UPDATE BLOG
export async function findAndUpdateBlog(
  query: FilterQuery<BlogDocument>,
  update: UpdateQuery<BlogDocument>,
  options: QueryOptions = { new: true, runValidators: true }
) {
  return BlogModel.findOneAndUpdate(query, update, options);
}

// DELETE ONE BLOG
export async function deleteBlog(
  query: FilterQuery<BlogDocument>
) {
  return BlogModel.deleteOne(query);
}

// FIND ALL BLOGS
export async function findAllBlog(
  query: FilterQuery<BlogDocument>,
  options: QueryOptions = { lean: true }
) {
  return BlogModel.find(query, {}, options)
    .sort({ sortOrder: -1, createdAt: -1 });
}

// FIND BLOGS FOR CARDS
export async function findAllBlogForCard() {
  return BlogModel.find()
    .select("title slug banner createdAt")
    .sort({ sortOrder: -1, createdAt: -1 });
}

// DELETE MULTIPLE BLOGS
export async function deleteManyBlog(
  query: FilterQuery<BlogDocument>
) {
  return BlogModel.deleteMany(query);
}

// FIND BLOG WITH RELATED PACKAGES
export async function findBlogWithPackages(
  query: FilterQuery<BlogDocument>
) {
  return BlogModel.findOne(query)
    .populate("relatedPackages");
}

// FIND ALL BLOGS WITH RELATED PACKAGES
export async function findAllBlogsWithPackages(
  query: FilterQuery<BlogDocument>,
  options: QueryOptions = {}
) {
  return BlogModel.find(query, {}, options)
    .populate("relatedPackages")
    .sort({ sortOrder: -1, createdAt: -1 });
}
