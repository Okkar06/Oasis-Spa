import express, { json, NextFunction, Request, Response, urlencoded } from 'express';
import cors from 'cors';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import mainRoutes from './routes/mainRoutes.js';
import sessionStore from './store/sessionStore.js';
import { globalErrorHandler, NotFoundError } from './types/errors.js';
import { bigintSerializerMiddleware } from './middlewares/bigintSerializer.js';
import translationRoutes from './routes/translationRoutes.js';
import revenueRoutes from './routes/revenueRoutes.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy when behind nginx/load balancer
app.set('trust proxy', 1);

const allowedOrigins = [process.env.CLIENT_URL, 'http://localhost:5173'].filter((v): v is string => !!v);

const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Set-Cookie',
    'X-Requested-With',
    'X-Simulation-Mode',
    'Access-Control-Allow-Origin',
  ],
  credentials: true,
  maxAge: 600,
  optionsSuccessStatus: 204,
};

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Much more lenient for development
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again later.',
});

app.use(json());
app.use(bigintSerializerMiddleware);
app.use(urlencoded({ extended: true }));
app.use(cors(corsOptions));
app.use(limiter);
app.use(cookieParser());

app.use(
  session({
    store: sessionStore,
    secret: process.env.JWT_SECRET as string,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    //   secure: process.env.NODE_ENV === 'production', // Set to true if using HTTPS
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      httpOnly: true,
    },
  })
);

app.use('/api', mainRoutes);
app.use('/api/translations', translationRoutes);
app.use('/api/trans', translationRoutes);
app.use('/api/rr', revenueRoutes); // Mount revenue routes

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  
  // Handle React routing - send all non-API requests to index.html
  // The compiled server runs from `dist`, so client files may be at several locations.
  // Check likely locations and serve from the first that contains index.html.
  const candidates = [
    path.join(__dirname, 'public'), // dist/public
    path.join(__dirname, '..', 'public'), // server/public (when server is published with public folder)
    path.join(process.cwd(), 'public'), // /home/site/wwwroot/public
  ];

  let staticDir = candidates.find((dir) => {
    try {
      return fs.existsSync(path.join(dir, 'index.html'));
    } catch (e) {
      return false;
    }
  });

  // Fallback to __dirname/public if nothing found (keeps previous behavior)
  if (!staticDir) staticDir = path.join(__dirname, 'public');

  app.use(express.static(staticDir));

  // Handle React routing - send all non-API requests to index.html
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(staticDir as string, 'index.html'));
  });
} else {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) return next();
    throw new NotFoundError(`Can't find ${req.originalUrl} on this server!`);
  });
}

app.use(globalErrorHandler);

export default app;
