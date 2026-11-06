
import { RequestHandler } from "express";
import sanitizeHtml from "sanitize-html";

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: false,
  allowedAttributes: false,
  allowVulnerableTags: true,
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
  transformTags: {
    "*": (tagName, attribs) => {
      const safeAttribs: Record<string, string> = {};
      for (const [key, value] of Object.entries(attribs)) {
        if (key.toLowerCase().startsWith("on")) continue;
        safeAttribs[key] = value;
      }
      return { tagName, attribs: safeAttribs };
    },
  },
  exclusiveFilter: (frame) => frame.tag === "script",
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === "[object Object]";

const sanitizeValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    return sanitizeHtml(value, sanitizeOptions).replace(/&amp;/g, "&");
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = sanitizeValue(val);
    }
    return result;
  }
  return value;
};

const sanitizeObjectInPlace = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const item = value[i];
      const sanitized = sanitizeValue(item);
      value[i] = sanitized as unknown;
      sanitizeObjectInPlace(sanitized);
    }
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, val] of Object.entries(value)) {
      const sanitized = sanitizeValue(val);
      value[key] = sanitized as unknown;
      sanitizeObjectInPlace(sanitized);
    }
  }
};

export const sanitizeHtmlMiddleware: RequestHandler = (req, _res, next) => {
  req.body = sanitizeValue(req.body);
  sanitizeObjectInPlace(req.query);
  sanitizeObjectInPlace(req.params);
  next();
};
