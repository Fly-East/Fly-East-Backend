import axios from "axios";
import logger from "./logger";

export interface IpGeoResult {
  query: string;
  status: "success" | "fail";
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  message?: string;
}

const PRIVATE_IP =
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|127\.|::1|localhost|unknown)/i;

export async function lookupIpGeo(ip: string): Promise<IpGeoResult> {
  const trimmed = (ip || "").trim();
  if (!trimmed || PRIVATE_IP.test(trimmed)) {
    return {
      query: trimmed || "unknown",
      status: "fail",
      message: "private or invalid ip",
    };
  }

  try {
    const { data } = await axios.get<IpGeoResult>(
      `http://ip-api.com/json/${encodeURIComponent(trimmed)}`,
      { timeout: 4000 }
    );
    return data;
  } catch (err) {
    logger.warn({ err, ip: trimmed }, "ip-api lookup failed");
    return { query: trimmed, status: "fail", message: "lookup failed" };
  }
}

export function toNotificationIpFields(
  geo: IpGeoResult
): Record<string, string> {
  if (geo.status !== "success") {
    return {};
  }

  const fields: Record<string, string> = {};
  if (geo.country) fields.ipCountry = geo.country;
  if (geo.city) fields.ipCity = geo.city;
  if (geo.regionName || geo.region) {
    fields.ipRegion = geo.regionName || geo.region || "";
  }
  if (geo.isp) fields.ipIsp = geo.isp;
  if (geo.timezone) fields.ipTimezone = geo.timezone;
  if (geo.org) fields.ipOrg = geo.org;
  return fields;
}

/** Flatten stored Payment.ipMeta (or live lookup) for notification context. */
export function ipContextFromStored(
  clientIp?: string | null,
  ipMeta?: IpGeoResult | Record<string, unknown> | null
): Record<string, unknown> {
  if (!clientIp) return {};

  const geo = (ipMeta ?? {
    query: clientIp,
    status: "fail",
  }) as IpGeoResult;

  return {
    ip: clientIp,
    ipMeta: geo,
    ...toNotificationIpFields(geo),
  };
}
