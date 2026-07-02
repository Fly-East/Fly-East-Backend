import { Request, Response } from "express";
import Contact from "../models/contact.model";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface ContactCache {
  data: any[];
  pagination: {
    total: number;
    totalPages: number;
    currentPage: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrev: boolean;
    nextPage: number | null;
    previousPage: number | null;
  };
}

export const createContact = async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      company,
      budget,
      goal,
      message,
      number,
      phone,
      source,
      travelDate,
    } = req.body;

    // Basic validation
    if (!name || !email || !message) {
      return res.status(400).json({
        status: "error",
        message: "Name, email, and message are required fields",
      });
    }

    const newContact = await Contact.create({
      name,
      email,
      company: company || "",
      budget: budget || "",
      goal: goal || "",
      message,
      number: number || phone || "",
      travelDate: travelDate || "",
      source: source || "",
    });

    // Invalidate all contact cache
    await clearCacheByPrefix("contacts:");
    await clearCacheByPrefix("");
    return res.status(201).json({
      status: "success",
      message: "Contact form submitted successfully",
      data: newContact,
    });
  } catch (error: any) {
    logger.error("Error creating contact:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to submit contact form",
      error: error?.message,
    });
  }
};

export const getAllContacts = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `contacts:page:${page}:limit:${limit}`;

    // Try to get from cache
    const cached = await getCache<ContactCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Contacts fetched successfully (from cache)",
      });
    }

    const [contacts, total] = await Promise.all([
      Contact.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Contact.countDocuments(),
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

    await setCache(cacheKey, { data: contacts, pagination }, CACHE_TTL);

    return res.status(200).json({
      status: "success",
      data: contacts,
      pagination,
      message: "Contacts fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error fetching contacts:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch contacts",
    });
  }
};

export const getContactById = async (req: Request, res: Response) => {
  try {
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        status: "error",
        message: "Contact not found",
      });
    }

    return res.status(200).json({
      status: "success",
      data: contact,
    });
  } catch (error: any) {
    logger.error("Error fetching contact:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch contact",
    });
  }
};

export const updateContact = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedContact = await Contact.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedContact) {
      return res.status(404).json({
        status: "error",
        message: "Contact not found",
      });
    }

    // Invalidate all contact cache
    await clearCacheByPrefix("contacts:");
    await clearCacheByPrefix("");
    return res.status(200).json({
      status: "success",
      message: "Contact updated successfully",
      data: updatedContact,
    });
  } catch (error: any) {
    logger.error("Error updating contact:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to update contact",
    });
  }
};

export const deleteContact = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deletedContact = await Contact.findByIdAndDelete(id);

    if (!deletedContact) {
      return res.status(404).json({
        status: "error",
        message: "Contact not found",
      });
    }

    // Invalidate all contact cache
    await clearCacheByPrefix("contacts:");
    await clearCacheByPrefix("");
    return res.status(200).json({
      status: "success",
      message: "Contact deleted successfully",
      data: null,
    });
  } catch (error: any) {
    logger.error("Error deleting contact:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to delete contact",
    });
  }
};
