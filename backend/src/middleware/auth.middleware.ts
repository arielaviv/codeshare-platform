import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.utils';
import { User } from '../models/User';
import { ApiError } from './error.middleware';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('Access token required', 401);
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new ApiError('Access token required', 401);
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId);

    if (!user) {
      throw new ApiError('User not found', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError('Invalid or expired token', 401));
    }
  }
};

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId);

    if (user) {
      req.user = user;
    }

    next();
  } catch {
    next();
  }
};
