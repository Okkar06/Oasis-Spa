import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to serialize BigInt and Decimal values in JSON responses
 * Prisma returns BigInt for database IDs and Decimal for numeric fields,
 * but JSON.stringify can't handle them directly
 */
export const bigintSerializerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Override res.json to handle BigInt and Decimal serialization
  const originalJson = res.json.bind(res);

  res.json = function (data: any) {
    const serialized = serializeBigIntAndDecimal(data);
    return originalJson(serialized);
  };

  next();
};

/**
 * Check if object is a Prisma Decimal
 */
const isDecimal = (obj: any): boolean => {
  return obj && typeof obj === 'object' && 'd' in obj && 's' in obj && 'e' in obj;
};

/**
 * Recursively convert BigInt and Decimal to string/number
 */
const serializeBigIntAndDecimal = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Date) {
    const time = obj.getTime();
    return Number.isNaN(time) ? null : obj.toISOString();
  }

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  // Handle Prisma Decimal objects - convert to string to preserve precision
  if (isDecimal(obj)) {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => serializeBigIntAndDecimal(item));
  }

  if (typeof obj === 'object') {
    const serialized: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        serialized[key] = serializeBigIntAndDecimal(obj[key]);
      }
    }
    return serialized;
  }

  return obj;
};
