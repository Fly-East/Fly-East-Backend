import { Request, Response, NextFunction } from "express";
export const convertSortOrderToNumber = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.body.sortOrder !== undefined) {
    const parsed = Number(req.body.sortOrder);
    req.body.sortOrder = isNaN(parsed) ? undefined : parsed;
  }
  next();
};
