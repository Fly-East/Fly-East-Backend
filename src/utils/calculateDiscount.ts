import FixedDate from "../models/fixedDate.model";
import { Pax } from "../models/pax.model";

export async function calculateTotalWithDiscount(
  packageId: string,
  fixedDateId: string,
  totalPersons: number
): Promise<{
  basePricePerPerson: number;
  totalPersons: number;
  originalTotal: number;
  discountPercentage: number;
  discountAmount: number;
  finalTotal: number;
  appliedPaxRange?: {
    min: number;
    max: number;
    discount: number;
  };
}> {
  // Get base price per person from FixedDate and all pax ranges for the package
  const [fixedDate, paxRanges = []] = await Promise.all([
    FixedDate.findById(fixedDateId),
    Pax.find({ package: packageId }).sort({ pricePerperson: -1 }), // Sort by discount in descending order
  ]);

  if (!fixedDate) throw new Error("Fixed date not found");

  // Initialize values
  const basePricePerPerson = fixedDate.pricePerPerson;
  const originalTotal = basePricePerPerson * totalPersons;
  let discountPercentage = 0;
  let discountAmount = 0;
  let finalTotal = originalTotal;
  let appliedPaxRange = null;

  // If there are pax ranges, find the best applicable one
  if (paxRanges && paxRanges.length > 0) {
    // Find the best applicable pax range (highest discount that matches the totalPersons)
    for (const pax of paxRanges) {
      if (totalPersons >= pax.min && totalPersons <= pax.max) {
       
        discountAmount = pax.discount;
        appliedPaxRange = {
          min: pax.min,
          max: pax.max,
          discount: pax.discount,
        };
        break; // Since we sorted by discount in descending order, first match is the best
      }
    }

    // Calculate discount if applicable
    if (discountAmount > 0) {
      discountAmount = Math.min(discountAmount, originalTotal);
      finalTotal = originalTotal - discountAmount;
      discountPercentage =
        originalTotal > 0 ? +(discountAmount / originalTotal * 100).toFixed(2) : 0;
    }
  }

  return {
    basePricePerPerson,
    totalPersons,
    originalTotal,
    discountPercentage,
    discountAmount,
    finalTotal,
    ...(appliedPaxRange && { appliedPaxRange }),
  };
}
