import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';

export const validatePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body;
    const storedHash = res.locals.hash;

    if (!password || !storedHash) {
      res.status(400).json({ message: 'Password validation failed' });
      return;
    }

    const isValid = await bcrypt.compare(password, storedHash);

    if (isValid) {
      res.locals.result = true;
      next();
    } else {
      res.locals.result = false;
      next();
    }
  } catch (error) {
    console.error('Error in password validation:', error);
    res.status(500).json({ message: 'Password validation error' });
  }
};

export const hashPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ message: 'Password is required' });
      return;
    }

    // Validate password strength
    if (password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters long' });
      return;
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    res.locals.hash = hashedPassword;
    next();
  } catch (error) {
    console.error('Error in password hashing:', error);
    res.status(500).json({ message: 'Password hashing error' });
  }
};
