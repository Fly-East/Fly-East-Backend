import { FilterQuery, QueryOptions, UpdateQuery } from "mongoose";
import PrivateTripModel, {
  PrivateTripDocument,
  PrivateTripInput,
} from "../models/privateTrip.model";

export async function createPrivateTrip(input: PrivateTripInput) {
  const result = await PrivateTripModel.create(input);

  return result;
}

export async function findPrivateTrip(
  query: FilterQuery<PrivateTripDocument>,
  options: QueryOptions = { lean: true }
) {
  const populateOptions = [
    {
      path: "package",
    },
  ];
  const result = await PrivateTripModel.findOne(query, {}, options).populate(
    populateOptions
  );
  return result;
}

export async function findAndUpdatePrivateTrip(
  query: FilterQuery<PrivateTripDocument>,
  update: UpdateQuery<PrivateTripDocument>,
  options: QueryOptions
) {
  return PrivateTripModel.findOneAndUpdate(query, update, options);
}

export async function deletePrivateTrip(
  query: FilterQuery<PrivateTripDocument>
) {
  return PrivateTripModel.deleteOne(query);
}

export async function findAllPrivateTrips(
  query: FilterQuery<PrivateTripDocument> = {},
  options: { skip?: number; limit?: number; sort?: any } = {}
) {
  const { skip = 0, limit = 100, sort = { createdAt: -1 } } = options;

  const [total, data] = await Promise.all([
    PrivateTripModel.countDocuments(query),
    PrivateTripModel.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate({
        path: "package",
      })
      .lean(),
  ]);

  return {
    data,
    total,
    skip,
    limit,
  };
}

export async function deleteManyPrivateTrips(
  query: FilterQuery<PrivateTripDocument>
) {
  return PrivateTripModel.deleteMany(query);
}
