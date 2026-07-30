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

export type CreatePackageAddonInput = {
  packageId: string;
  addonId: string;
  price: unknown;
  pricingType: string;
  isDefault?: unknown;
  isActive?: unknown;
  sortOrder?: unknown;
};

export type UpdatePackageAddonInput = {
  price?: unknown;
  pricingType?: string;
  isDefault?: unknown;
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
        isDefault: toBoolean(isDefault),
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
    const { price, pricingType, isDefault, isActive, sortOrder, addonId } =
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

    try {
      const updated = await PackageAddon.findOneAndUpdate(
        { _id: packageAddonId },
        {
          ...(price !== undefined && { price: Number(price) }),
          ...(pricingType !== undefined && { pricingType }),
          ...(isDefault !== undefined && {
            isDefault: toBoolean(isDefault),
          }),
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
