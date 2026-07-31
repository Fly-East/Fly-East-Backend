import { clearCacheByPrefix } from "../../../utils/redis";
import { ADDON_PRICING_TYPE_VALUES } from "../../addons/constants/addons.constants";
import { Addons } from "../../addons/model/addons.model";
import Package from "../../../models/package.model";
import { PackageAddon } from "../model/package-addons.model";
import { IPackageAddon } from "../types/package-addons.types";

const toBoolean = (value: unknown, fallback?: boolean): boolean => {
  if (value === undefined) {
    return fallback ?? false;
  }
  return value === true || value === "true";
};

const toPositiveInt = (value: unknown, fallback: number): number => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
};

const toOptionalPositiveInt = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return Math.floor(parsed);
};

const validateQuantities = (input: {
  isDefault?: boolean;
  defaultQuantity?: number;
  maxQuantity?: number | null;
}) => {
  const isDefault = input.isDefault ?? false;
  const defaultQuantity = isDefault
    ? toPositiveInt(input.defaultQuantity, 1)
    : 1;
  const maxQuantity = toOptionalPositiveInt(input.maxQuantity);

  if (isDefault && defaultQuantity < 1) {
    throw Object.assign(new Error("defaultQuantity must be at least 1"), {
      statusCode: 400,
    });
  }

  if (maxQuantity !== null && isDefault && defaultQuantity > maxQuantity) {
    throw Object.assign(
      new Error("defaultQuantity cannot exceed maxQuantity"),
      { statusCode: 400 }
    );
  }

  return { defaultQuantity, maxQuantity };
};

const assertPricingCompatibleWithAddon = (
  addon: {
    costsParticipants?: boolean;
    participantsPerQuantity?: number;
  },
  pricingType: string
) => {
  const costsParticipants = addon.costsParticipants === true;
  const hasParticipants = (addon.participantsPerQuantity ?? 0) > 0;

  // perPerson + costsParticipants is allowed;
  // blocked only when all three apply: costs participants, has participants, and perPerson
  if (costsParticipants && hasParticipants && pricingType === "perPerson") {
    throw Object.assign(
      new Error(
        "Addons that cost participants and define participants cannot use perPerson pricing"
      ),
      { statusCode: 400 }
    );
  }
};

export type CreatePackageAddonInput = {
  packageId: string;
  addonId: string;
  price: unknown;
  pricingType: string;
  isDefault?: unknown;
  defaultQuantity?: unknown;
  maxQuantity?: unknown;
  isActive?: unknown;
  sortOrder?: unknown;
};

export type UpdatePackageAddonInput = {
  price?: unknown;
  pricingType?: string;
  isDefault?: unknown;
  defaultQuantity?: unknown;
  maxQuantity?: unknown;
  isActive?: unknown;
  sortOrder?: unknown;
  addonId?: string;
};

class PackageAddonsService {
  async createPackageAddon(
    input: CreatePackageAddonInput
  ): Promise<IPackageAddon> {
    const {
      packageId,
      addonId,
      price,
      pricingType,
      isDefault,
      defaultQuantity,
      maxQuantity,
      isActive,
      sortOrder,
    } = input;

    if (
      !packageId ||
      !addonId ||
      price === undefined ||
      price === null ||
      !pricingType
    ) {
      throw Object.assign(
        new Error("packageId, addonId, price, and pricingType are required"),
        { statusCode: 400 }
      );
    }

    if (!(ADDON_PRICING_TYPE_VALUES as string[]).includes(pricingType)) {
      throw Object.assign(
        new Error(
          `Invalid pricingType. Allowed: ${ADDON_PRICING_TYPE_VALUES.join(", ")}`
        ),
        { statusCode: 400 }
      );
    }

    const [pkg, addon] = await Promise.all([
      Package.findById(packageId),
      Addons.findOne({ _id: addonId, isDeleted: false, isActive: true }),
    ]);

    if (!pkg) {
      throw Object.assign(new Error("Package not found"), { statusCode: 404 });
    }

    if (!addon) {
      throw Object.assign(new Error("Addon not found"), { statusCode: 404 });
    }

    assertPricingCompatibleWithAddon(addon, pricingType);

    const resolvedIsDefault = toBoolean(isDefault);
    const quantities = validateQuantities({
      isDefault: resolvedIsDefault,
      defaultQuantity: toPositiveInt(defaultQuantity, 1),
      maxQuantity: toOptionalPositiveInt(maxQuantity),
    });

    let resolvedSortOrder =
      sortOrder !== undefined ? Number(sortOrder) : undefined;
    if (resolvedSortOrder === undefined || Number.isNaN(resolvedSortOrder)) {
      const lastOffer = await PackageAddon.findOne({ package: packageId }).sort({
        sortOrder: -1,
      });
      resolvedSortOrder = lastOffer ? lastOffer.sortOrder + 1 : 0;
    }

    try {
      const packageAddon = await PackageAddon.create({
        package: packageId,
        addon: addonId,
        price: Number(price),
        pricingType,
        isDefault: resolvedIsDefault,
        defaultQuantity: quantities.defaultQuantity,
        maxQuantity: quantities.maxQuantity,
        isActive: toBoolean(isActive, true),
        sortOrder: resolvedSortOrder,
      });

      const populated = await PackageAddon.findById(packageAddon._id)
        .populate("addon")
        .populate("package", "name");

      await clearCacheByPrefix("");
      return populated as IPackageAddon;
    } catch (error: any) {
      if (error?.code === 11000) {
        throw Object.assign(
          new Error("This addon is already linked to the package"),
          { statusCode: 409 }
        );
      }
      throw error;
    }
  }

  async getAll(filters?: { packageId?: string }): Promise<IPackageAddon[]> {
    const query: Record<string, unknown> = {};
    if (filters?.packageId) {
      query.package = filters.packageId;
    }

    return PackageAddon.find(query)
      .populate("addon")
      .populate("package", "name")
      .sort({ sortOrder: 1, createdAt: -1 });
  }

  async getByPackageId(packageId: string): Promise<IPackageAddon[]> {
    return PackageAddon.find({
      package: packageId,
      isActive: true,
    })
      .populate("addon")
      .populate("package", "name")
      .sort({ sortOrder: 1 });
  }

  async getById(packageAddonId: string): Promise<IPackageAddon> {
    const packageAddon = await PackageAddon.findById(packageAddonId)
      .populate("addon")
      .populate("package", "name");

    if (!packageAddon) {
      throw Object.assign(new Error("Package addon not found"), {
        statusCode: 404,
      });
    }

    return packageAddon;
  }

  async updatePackageAddon(
    packageAddonId: string,
    input: UpdatePackageAddonInput
  ): Promise<IPackageAddon> {
    const { price, pricingType, isDefault, defaultQuantity, maxQuantity, isActive, sortOrder, addonId } =
      input;

    if (
      pricingType !== undefined &&
      !(ADDON_PRICING_TYPE_VALUES as string[]).includes(pricingType)
    ) {
      throw Object.assign(
        new Error(
          `Invalid pricingType. Allowed: ${ADDON_PRICING_TYPE_VALUES.join(", ")}`
        ),
        { statusCode: 400 }
      );
    }

    if (addonId !== undefined) {
      const addon = await Addons.findOne({
        _id: addonId,
        isDeleted: false,
      });
      if (!addon) {
        throw Object.assign(new Error("Addon not found"), { statusCode: 404 });
      }
    }

    const existing = await PackageAddon.findById(packageAddonId);
    if (!existing) {
      throw Object.assign(new Error("Package addon not found"), {
        statusCode: 404,
      });
    }

    const resolvedAddonId =
      addonId !== undefined ? addonId : String(existing.addon);
    const resolvedPricingType =
      pricingType !== undefined ? pricingType : existing.pricingType;

    const catalogAddon = await Addons.findOne({
      _id: resolvedAddonId,
      isDeleted: false,
    });
    if (!catalogAddon) {
      throw Object.assign(new Error("Addon not found"), { statusCode: 404 });
    }
    assertPricingCompatibleWithAddon(catalogAddon, resolvedPricingType);

    const resolvedIsDefault =
      isDefault !== undefined ? toBoolean(isDefault) : existing.isDefault;
    const resolvedMaxQuantity =
      maxQuantity !== undefined
        ? toOptionalPositiveInt(maxQuantity)
        : existing.maxQuantity;
    const quantities = validateQuantities({
      isDefault: resolvedIsDefault,
      defaultQuantity:
        defaultQuantity !== undefined
          ? toPositiveInt(defaultQuantity, existing.defaultQuantity)
          : existing.defaultQuantity,
      maxQuantity: resolvedMaxQuantity,
    });

    try {
      const updated = await PackageAddon.findOneAndUpdate(
        { _id: packageAddonId },
        {
          ...(price !== undefined && { price: Number(price) }),
          ...(pricingType !== undefined && { pricingType }),
          ...(isDefault !== undefined && {
            isDefault: resolvedIsDefault,
          }),
          defaultQuantity: quantities.defaultQuantity,
          maxQuantity: quantities.maxQuantity,
          ...(isActive !== undefined && {
            isActive: toBoolean(isActive),
          }),
          ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
          ...(addonId !== undefined && { addon: addonId }),
        },
        { new: true, runValidators: true }
      )
        .populate("addon")
        .populate("package", "name");

      if (!updated) {
        throw Object.assign(new Error("Package addon not found"), {
          statusCode: 404,
        });
      }

      await clearCacheByPrefix("");
      return updated;
    } catch (error: any) {
      if (error?.code === 11000) {
        throw Object.assign(
          new Error("This addon is already linked to the package"),
          { statusCode: 409 }
        );
      }
      throw error;
    }
  }

  async deletePackageAddon(packageAddonId: string): Promise<void> {
    const deleted = await PackageAddon.findOneAndDelete({
      _id: packageAddonId,
    });

    if (!deleted) {
      throw Object.assign(new Error("Package addon not found"), {
        statusCode: 404,
      });
    }

    await clearCacheByPrefix("");
  }
}

export const packageAddonsService = new PackageAddonsService();
export default PackageAddonsService;
