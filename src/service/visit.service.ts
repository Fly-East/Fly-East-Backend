import axios from 'axios';
import visitModel from '../models/visit.model';

interface GeoData {
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

interface TrackVisitParams {
  ip: string | string[] | undefined;
  path: string;
  userAgent: string;
  referer: string;
  acceptLanguage: string;
}

export async function trackVisitService({ 
  ip, 
  path, 
  userAgent, 
  referer, 
  acceptLanguage 
}: TrackVisitParams): Promise<void> {
  // Only call geo API for public IPs (not localhost or private ranges)
  const ipString = Array.isArray(ip) ? ip[0] : ip || '';
  const isPublicIP =
    ipString &&
    !/^10\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^127\.|^::1/.test(ipString);

  let geoData: GeoData = {};
  if (isPublicIP) {
    try {
      const geo = await axios.get(`https://ipapi.co/${ip}/json/`);
      geoData = {
        city: geo.data.city,
        region: geo.data.region,
        country: geo.data.country_name,
        latitude: geo.data.latitude,
        longitude: geo.data.longitude,
      };
    } catch (e) {
      geoData = {};
    }
  }

  const timestamp = new Date();
  const visitData: any = {
    ip: ipString,
    path,
    userAgent,
    referer,
    acceptLanguage,
    timestamp,
  };

  // Only add geoData properties if they exist
  if (geoData.city) visitData.city = geoData.city;
  if (geoData.region) visitData.region = geoData.region;
  if (geoData.country) visitData.country = geoData.country;
  if (geoData.latitude) visitData.latitude = geoData.latitude;
  if (geoData.longitude) visitData.longitude = geoData.longitude;

  return visitModel.create(visitData);
}

interface VisitFilter {
  [key: string]: any;
}

interface QueryOptions {
  sort?: any;
  limit?: number;
  skip?: number;
  [key: string]: any;
}

export async function getVisitsService(filter: VisitFilter = {}, options: QueryOptions = {}) {
  return visitModel.find(filter, null, options);
}

interface CountryStats {
  country: string;
  count: number;
}

interface VisitStatsResponse {
  totalVisits: number;
  totalCountries: number;
  countries: CountryStats[];
}

export async function getVisitsStatsService(): Promise<VisitStatsResponse> {
  const [stats, totalVisits, uniqueCountries] = await Promise.all([
    // Get country-wise stats
    visitModel.aggregate([
      { $match: { country: { $exists: true, $ne: null } } },
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, country: '$_id', count: 1 } }
    ]),
    // Get total number of visits
    visitModel.countDocuments(),
    // Get count of unique countries
    visitModel.distinct('country').then(countries => 
      countries.filter(Boolean).length // Filter out any null/undefined values
    )
  ]);

  return {
    totalVisits,
    totalCountries: uniqueCountries,
    countries: stats
  };
}
