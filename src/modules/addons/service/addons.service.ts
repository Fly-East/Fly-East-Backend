import { clearCacheByPrefix } from "../../../utils/redis";
import { PackageAddon } from "../../package-addons/model/package-addons.model";
import { Addons } from "../model/addons.model";
import { IAddons } from "../types/addons.types";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toBoolean = (value: unknown, fallback?: boolean): boolean => {
  if (value === undefined) {
    return fallback ?? false;
  }
  return value === true || value === "true";
};

export type CreateAddonInput = {
  name: string;
  description: string;
  slug?: string;
  allowsQuantity?: unknown;
  costsParticipants?: unknown;
  participantsPerQuantity?: unknown;
  isActive?: unknown;
  sortOrder?: unknown;
};

export type UpdateAddonInput = {
  name?: string;
  description?: string;
  slug?: string;
  allowsQuantity?: unknown;
  costsParticipants?: unknown;
  participantsPerQuantity?: unknown;
  isActive?: unknown;
  sortOrder?: unknown;
};

class AddonsService {
  async createAddon(input: CreateAddonInput): Promise<IAddons> {
    const { name, description, slug } = input;

    if (!name || !description) {
      throw Object.assign(new Error("Name and description are required"), {
        statusCode: 400,
      });
    }

    const lastAddon = await Addons.findOne().sort({ sortOrder: -1 });
    const sortOrder =
      input.sortOrder !== undefined
        ? Number(input.sortOrder)
        : lastAddon
          ? lastAddon.sortOrder + 1
          : 0;

    const resolvedSlug =
      (typeof slug === "string" && slug.trim()) ||
      `${slugify(name)}-${Date.now()}`;

    const costsParticipants = toBoolean(input.costsParticipants);
    const participantsPerQuantity = input.participantsPerQuantity
      ? Number(input.participantsPerQuantity)
      : 0;

    const savedAddon = await Addons.create({
      name,
      description,
      slug: resolvedSlug,
      allowsQuantity: toBoolean(input.allowsQuantity),
      costsParticipants,
      participantsPerQuantity,
      isActive: toBoolean(input.isActive, true),
      sortOrder,
    });

    await clearCacheByPrefix("");
    return savedAddon;
  }

  async getCatalogAddons(): Promise<IAddons[]> {
    return Addons.find({ isDeleted: false }).sort({ sortOrder: 1 });
  }

  async getAddonById(addonId: string): Promise<IAddons> {
    const addon = await Addons.findOne({
      _id: addonId,
      isDeleted: false,
    });

    if (!addon) {
      throw Object.assign(new Error("Addon not found"), { statusCode: 404 });
    }

    return addon;
  }

  async updateAddon(addonId: string, input: UpdateAddonInput): Promise<IAddons> {
    const existingAddon = await Addons.findById(addonId);
    if (!existingAddon || existingAddon.isDeleted) {
      throw Object.assign(new Error("Addon not found"), { statusCode: 404 });
    }

    const nextCostsParticipants =
      input.costsParticipants !== undefined
        ? toBoolean(input.costsParticipants)
        : existingAddon.costsParticipants;
    const nextParticipants =
      input.participantsPerQuantity !== undefined
        ? Number(input.participantsPerQuantity)
        : existingAddon.participantsPerQuantity;

    if (nextCostsParticipants && nextParticipants > 0) {
      const conflictingOffer = await PackageAddon.findOne({
        addon: addonId,
        pricingType: "perPerson",
      });
      if (conflictingOffer) {
        throw Object.assign(
          new Error(
            "Cannot set costsParticipants with participants while package offers use perPerson pricing. Change those offers first."
          ),
          { statusCode: 400 }
        );
      }
    }

    const updatedAddon = await Addons.findOneAndUpdate(
      { _id: addonId },
      {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.allowsQuantity !== undefined && {
          allowsQuantity: toBoolean(input.allowsQuantity),
        }),
        ...(input.costsParticipants !== undefined && {
          costsParticipants: toBoolean(input.costsParticipants),
        }),
        ...(input.participantsPerQuantity !== undefined && {
          participantsPerQuantity: Number(input.participantsPerQuantity),
        }),
        ...(input.isActive !== undefined && {
          isActive: toBoolean(input.isActive),
        }),
        ...(input.sortOrder !== undefined && {
          sortOrder: Number(input.sortOrder),
        }),
      },
      { new: true, runValidators: true }
    );

    if (!updatedAddon) {
      throw Object.assign(new Error("Addon not found"), { statusCode: 404 });
    }

    await clearCacheByPrefix("");
    return updatedAddon;
  }

  async deleteAddon(addonId: string): Promise<void> {
    const existingAddon = await Addons.findById(addonId);
    if (!existingAddon || existingAddon.isDeleted) {
      throw Object.assign(new Error("Addon not found"), { statusCode: 404 });
    }

    existingAddon.isDeleted = true;
    existingAddon.deletedAt = new Date();
    existingAddon.isActive = false;
    await existingAddon.save();

    await PackageAddon.updateMany({ addon: addonId }, { isActive: false });
    await clearCacheByPrefix("");
  }
}

export const addonsService = new AddonsService();
export default AddonsService;
