import { Request, Response } from "express";
import mongoose from "mongoose";
import { Package } from "../models";
import { clearCacheByPrefix } from "../utils/redis";
import SeasonalTrek from "../models/basedSeasonal.model";

// Create new SeasonalTrek
export const createSeasonalTrek = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { title, description, package: packageId } = req.body;

    if (!title || !packageId)
      return res
        .status(400)
        .json({ message: "Title and package are required." });

    // Validate package exists
    const packageExists = await Package.findById(packageId).session(session);
    if (!packageExists) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Package not found." });
    }

    const newTrek = new SeasonalTrek({
      title,
      description,
      package: packageId,
    });

    await newTrek.save({ session });

    // Add reference to package
    await Package.findByIdAndUpdate(
      packageId,
      { $push: { seasonalTrek: newTrek._id } },
      { session }
    );

    await session.commitTransaction();

    // Clear cache if needed
    await clearCacheByPrefix(`seasonalTrek:${packageId}:`);
    await clearCacheByPrefix("");
    res.status(201).json({
      message: "Seasonal Trek created successfully",
      seasonalTrek: newTrek,
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message || "Server error" });
  } finally {
    session.endSession();
  }
};

// Get all SeasonalTreks, optionally filtered by package
export const getAllSeasonalTreks = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.query;
    const filter: any = {};
    if (packageId) filter.package = packageId;

    const treks = await SeasonalTrek.find(filter).populate("package");
    res.status(200).json(treks);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// Get single SeasonalTrek by ID
export const getSeasonalTrekById = async (req: Request, res: Response) => {
  try {
    const trek = await SeasonalTrek.findById(req.params.id).populate("package");
    if (!trek)
      return res.status(404).json({ message: "Seasonal Trek not found" });
    res.status(200).json(trek);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// Update SeasonalTrek
export const updateSeasonalTrek = async (req: Request, res: Response) => {
  try {
    const { title, description, package: packageId } = req.body;

    const trek = await SeasonalTrek.findById(req.params.id);
    if (!trek)
      return res.status(404).json({ message: "Seasonal Trek not found" });

    if (title) trek.title = title;
    if (description) trek.description = description;
    if (packageId) trek.package = packageId;

    await trek.save();
    await clearCacheByPrefix("");
    res.status(200).json({
      message: "Seasonal Trek updated successfully",
      seasonalTrek: trek,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// Delete SeasonalTrek
export const deleteSeasonalTrek = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const trek = await SeasonalTrek.findById(req.params.id).session(session);
    if (!trek) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Seasonal Trek not found" });
    }

    // Remove reference from package
    await Package.findByIdAndUpdate(
      trek.package,
      { $pull: { seasonalTrek: trek._id } },
      { session }
    );

    await SeasonalTrek.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();

    await clearCacheByPrefix(`seasonaltreks:${trek.package}:`);
    await clearCacheByPrefix("");
    res.status(200).json({ message: "Seasonal Trek deleted successfully" });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message || "Server error" });
  } finally {
    session.endSession();
  }
};

//get season by package id
export const getSeasonalTrekByPackageId = async (
  req: Request,
  res: Response
) => {
  try {
    const { packageId } = req.params;
    const treks = await SeasonalTrek.find({ package: packageId });
    res.status(200).json(treks);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};
