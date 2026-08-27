export { Addons } from "./model/addons.model";
export type { IAddons } from "./types/addons.types";
export {
  ADDON_PRICING_TYPES,
  ADDON_PRICING_TYPE_VALUES,
  ADDON_PRICING_TYPE_OPTIONS,
} from "./constants/addons.constants";
export type { AddonPricingType } from "./constants/addons.constants";
export { addonsService } from "./service/addons.service";
export { default as addonsRoutes } from "./routes/addons.routes";
