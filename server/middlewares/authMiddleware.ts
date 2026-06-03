import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const REMEMBER_TOKEN_COOKIE = 'remember_token';

// Check if the user has a valid JWT token else check the session
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies[REMEMBER_TOKEN_COOKIE];
  if (token) {
    jwt.verify(token, process.env.JWT_SECRET as string, (err: unknown) => {
      if (err) {
        console.warn('JWT verification failed:', err);
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      next();
    });
  } else if (req.session && req.session.user_id) {
    next();
  } else {
    res.status(401).json({ message: 'Unauthorized' });
  }
};

export default isAuthenticated;
