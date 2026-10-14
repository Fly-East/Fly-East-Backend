import TravelerRecord from "../model/travelerRecord.model";

const TIMEZONE = "Asia/Kathmandu";
const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_DAYS = 30;
const TOP_N = 10;
const TREND_MONTHS = 24;

export type NamedCount = { name: string; count: number };
export type RouteCount = NamedCount & { region: string | null };
export type MonthCount = { month: string; created: number; departures: number };

export type TravelerRecordStats = {
  total: number;
  onTrekNow: number;
  upcoming: number;
  upcomingDays: number;
  withInsurance: number;
  withGuide: number;
  withDocuments: number;
  byRegion: NamedCount[];
  byRoute: RouteCount[];
  byNationality: NamedCount[];
  nationalityCount: number;
  byGender: NamedCount[];
  byInsurance: NamedCount[];
  trend: MonthCount[];
};

function nonEmpty(field: string) {
  return {
    $cond: [
      { $gt: [{ $strLenCP: { $ifNull: [`$${field}`, ""] } }, 0] },
      `$${field}`,
      null,
    ],
  };
}

function countBy(field: string, limit?: number) {
  return [
    { $group: { _id: nonEmpty(field), count: { $sum: 1 } } },
    { $match: { _id: { $ne: null } } },
    { $sort: { count: -1 as const, _id: 1 as const } },
    ...(limit ? [{ $limit: limit }] : []),
  ];
}

function monthOf(field: string) {
  return {
    $cond: [
      { $ifNull: [`$${field}`, false] },
      { $dateToString: { format: "%Y-%m", date: `$${field}`, timezone: TIMEZONE } },
      null,
    ],
  };
}

const toNamed = (rows: { _id: string; count: number }[]): NamedCount[] =>
  rows.map((r) => ({ name: r._id, count: r.count }));

/** Dashboard numbers for the records matching `match`. */
export async function travelerRecordStats(
  match: Record<string, unknown>
): Promise<TravelerRecordStats> {
  const now = new Date();
  const upcomingEnd = new Date(now.getTime() + UPCOMING_DAYS * DAY_MS);

  const [facets] = await TravelerRecord.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              onTrekNow: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $lte: ["$departureDate", now] },
                        { $gte: ["$endDate", now] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              upcoming: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gt: ["$departureDate", now] },
                        { $lte: ["$departureDate", upcomingEnd] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              withInsurance: {
                $sum: { $cond: [{ $ne: [nonEmpty("insuranceCompany"), null] }, 1, 0] },
              },
              withGuide: {
                $sum: { $cond: [{ $ifNull: ["$guideAssignment", false] }, 1, 0] },
              },
              withDocuments: {
                $sum: {
                  $cond: [{ $gt: [{ $size: { $ifNull: ["$documents", []] } }, 0] }, 1, 0],
                },
              },
            },
          },
        ],
        byRegion: countBy("trekkingRegion"),
        byRoute: [
          {
            $group: {
              _id: { route: nonEmpty("trekkingRoute"), region: nonEmpty("trekkingRegion") },
              count: { $sum: 1 },
            },
          },
          { $match: { "_id.route": { $ne: null } } },
          { $sort: { count: -1, "_id.route": 1 } },
          { $limit: TOP_N },
        ],
        byNationality: countBy("nationality", TOP_N),
        nationalityCount: [
          { $group: { _id: { $toUpper: nonEmpty("nationality") } } },
          { $match: { _id: { $ne: null } } },
          { $count: "n" },
        ],
        byGender: countBy("gender"),
        byInsurance: countBy("insuranceCompany"),
        createdByMonth: [
          { $group: { _id: monthOf("createdAt"), count: { $sum: 1 } } },
          { $match: { _id: { $ne: null } } },
        ],
        departuresByMonth: [
          { $group: { _id: monthOf("departureDate"), count: { $sum: 1 } } },
          { $match: { _id: { $ne: null } } },
        ],
      },
    },
  ]);

  const totals = facets.totals[0] ?? {
    total: 0,
    onTrekNow: 0,
    upcoming: 0,
    withInsurance: 0,
    withGuide: 0,
    withDocuments: 0,
  };

  const months = new Map<string, MonthCount>();
  const bucket = (month: string) => {
    if (!months.has(month)) months.set(month, { month, created: 0, departures: 0 });
    return months.get(month)!;
  };
  for (const r of facets.createdByMonth as { _id: string; count: number }[]) {
    bucket(r._id).created = r.count;
  }
  for (const r of facets.departuresByMonth as { _id: string; count: number }[]) {
    bucket(r._id).departures = r.count;
  }
  const trend = [...months.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-TREND_MONTHS);

  return {
    total: totals.total,
    onTrekNow: totals.onTrekNow,
    upcoming: totals.upcoming,
    upcomingDays: UPCOMING_DAYS,
    withInsurance: totals.withInsurance,
    withGuide: totals.withGuide,
    withDocuments: totals.withDocuments,
    byRegion: toNamed(facets.byRegion),
    byRoute: (facets.byRoute as { _id: { route: string; region: string | null }; count: number }[]).map(
      (r) => ({ name: r._id.route, region: r._id.region, count: r.count })
    ),
    byNationality: toNamed(facets.byNationality),
    nationalityCount: facets.nationalityCount[0]?.n ?? 0,
    byGender: toNamed(facets.byGender),
    byInsurance: toNamed(facets.byInsurance),
    trend,
  };
}
