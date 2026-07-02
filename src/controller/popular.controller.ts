import { Request, Response } from "express";
import { Package, Category } from "../models";
import { Types, Document } from "mongoose";
import logger from "../utils/logger";
import { getCache, setCache, deleteCache } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

interface CachedPackage extends Document {
  [key: string]: any;
}

const isValidObjectId = (id: string) => {
  return Types.ObjectId.isValid(id) && new Types.ObjectId(id).toString() === id;
};

export const getPopularPackagesByCategory = async (
  req: Request,
  res: Response
) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `popular:category:${category}:page:${page}:limit:${limit}`;

    // Try to get data from cache first with proper typing
    const cachedData = await getCache<{
      data: CachedPackage[];
      pagination: any;
    }>(cacheKey);
    if (cachedData && cachedData.data && cachedData.pagination) {
      return res.status(200).json({
        success: true,
        data: cachedData.data,
        pagination: cachedData.pagination,
        message: "Popular packages fetched successfully (from cache)",
      });
    }

    const query: any = {};

    if (isValidObjectId(category)) {
      query._id = new Types.ObjectId(category);
    } else {
      query.slug = category;
    }

    const categoryDoc = await Category.findOne(query);

    if (!categoryDoc) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
        query: query,
      });
    }

    const [popularPackages, total] = await Promise.all([
      Package.find({
        isPopular: true,
        $or: [
          { categoryId: categoryDoc._id },
          { "categoryId._id": categoryDoc._id },
        ],
      })
        .select("-__v")
        .populate("categoryId")
        .populate("subCategoryId")
        .populate("tripHighlight")
        .populate("visitPlaces")
        .populate("itinerary")
        .populate("attraction")
        .populate("inclusion")
        .populate("exclusion")
        .populate("pax")
        .populate("fixedDates")
        .populate("faq")
        .populate("requirements")
        .populate("testimonial")
        .skip(skip)
        .limit(limit)
        .lean(),
      Package.countDocuments({
        isPopular: true,
        $or: [
          { categoryId: categoryDoc._id },
          { "categoryId._id": categoryDoc._id },
        ],
      }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    const pagination = {
      total,
      totalPages,
      currentPage: page,
      itemsPerPage: limit,
      hasNextPage,
      hasPrev: hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : null,
      previousPage: hasPreviousPage ? page - 1 : null,
    };

    await setCache(cacheKey, { data: popularPackages, pagination }, CACHE_TTL);

    res.status(200).json({
      success: true,
      data: popularPackages,
      pagination,
      message: "Popular packages fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error getting popular packages by category:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving popular packages by category",
      error: error.message,
    });
  }
};

export const getAddToHomePackages = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `packages:home:page:${page}:limit:${limit}`;

    // Try to get data from cache first with proper typing
    const cachedData = await getCache<{
      data: CachedPackage[];
      pagination: any;
    }>(cacheKey);
    if (cachedData && cachedData.data && cachedData.pagination) {
      return res.status(200).json({
        success: true,
        data: cachedData.data,
        pagination: cachedData.pagination,
        message: "Add to home packages fetched successfully (from cache)",
      });
    }

    const packages = await Package.find({ addToHome: true })
      .select("-__v")
      .skip(skip)
      .limit(limit)
      .lean();

    // Function to safely populate a reference field
    const populateField = async (docs: any[], field: string, model: any) => {
      try {
        const validDocs = [];
        for (const doc of docs) {
          if (doc[field] && Types.ObjectId.isValid(doc[field].toString())) {
            const populated = await model.findById(doc[field]);
            if (populated) {
              doc[field] = populated;
            }
          }
          validDocs.push(doc);
        }
        return validDocs;
      } catch (error) {
        logger.warn(`Error populating ${field}:`, error);
        return docs;
      }
    };

    let result = [...packages];
    const fieldsToPopulate = [
      { field: "categoryId", model: Category },
      { field: "subCategoryId", model: Category },
      { field: "tripHighlight", model: "TripHighlight" },
      { field: "visitPlaces", model: "VisitPlace" },
      { field: "itinerary", model: "Itinerary" },
      { field: "attraction", model: "Attraction" },
      { field: "inclusion", model: "Inclusion" },
      { field: "exclusion", model: "Exclusion" },
      { field: "pax", model: "Pax" },

      { field: "fixedDates", model: "FixedDate" },
      { field: "faq", model: "FAQ" },
      { field: "requirements", model: "Requirement" },
      { field: "testimonial", model: "Testimonial" },
    ];

    for (const { field, model } of fieldsToPopulate) {
      result = await populateField(result, field, model);
    }

    const total = await Package.countDocuments({ addToHome: true });
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    const pagination = {
      total,
      totalPages,
      currentPage: page,
      itemsPerPage: limit,
      hasNextPage,
      hasPrev: hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : null,
      previousPage: hasPreviousPage ? page - 1 : null,
    };

    await setCache(cacheKey, { data: result, pagination }, CACHE_TTL);

    res.status(200).json({
      success: true,
      data: result,
      pagination,
      message: "Add to home packages fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error getting add to home packages:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving add to home packages",
      error: error.message,
    });
  }
};

export default {
  getPopularPackagesByCategory,
  getAddToHomePackages,
};
