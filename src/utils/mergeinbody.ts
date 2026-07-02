import { Request, Response, NextFunction } from 'express';
import { Request as ExpressRequest } from 'express';

export const mergeFilesIntoBody = (req: ExpressRequest, res: Response, next: NextFunction) => {
  const files = req.files as { [key: string]: Express.Multer.File[] };
  
  if (files) {
    if (files.coverImage?.[0]) {
      req.body.coverImage = {
        path: files.coverImage[0].path,
        filename: files.coverImage[0].filename
      };
    }
    if (files.routeMap?.[0]) {
      req.body.routeMap = {
        path: files.routeMap[0].path,
        filename: files.routeMap[0].filename
      };
    }
    if (files.gallery) {
      req.body.gallery = files.gallery.map(file => ({
        path: file.path,
        filename: file.filename
      }));
    }
  }
  
  next();
};