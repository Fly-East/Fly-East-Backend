/** Cascading trekking areas (from the Trekkers Information Form): region -> routes. */
export const TREKKING_AREAS: Record<string, string[]> = {
  Annapurna: [
    "Annapurna Circuit",
    "Poonhill",
    "ABC",
    "Mardi Himal",
    "Upper Mustang",
    "Narphu Valley",
    "Lower Mustang",
  ],
  Everest: ["Three Passes", "EBC", "EBC with Gokyo", "Pikey Peak"],
  Langtang: [
    "Langtang Valley",
    "Gosainkunda",
    "Tamang Heritage",
    "Langtang Valley & Gosainkunda",
  ],
  Kanchenjunga: ["Kanchenjunga Base Camp"],
  Manaslu: ["Manaslu Circuit", "Manaslu with Tsum Valley", "Tsum Valley"],
  Rolwaling: [],
};

export type TrekkingRegionOption = { name: string; routes: string[] };

export const TREKKING_REGION_OPTIONS: TrekkingRegionOption[] = Object.entries(
  TREKKING_AREAS
).map(([name, routes]) => ({ name, routes }));

export function isKnownRegion(region: string): boolean {
  return Object.prototype.hasOwnProperty.call(TREKKING_AREAS, region);
}

export function isRouteInRegion(region: string, route: string): boolean {
  return isKnownRegion(region) && TREKKING_AREAS[region].includes(route);
}
