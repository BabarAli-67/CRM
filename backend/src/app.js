import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import helmet from 'helmet';
import env from './config/env.config.js';
import { notFound, errorHandler } from './middlewares/error.middleware.js';
import authRoutes from './routes/auth.route.js';
import adminRoutes from './routes/admin.route.js';

const app = express();

const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Flash Digital CRM API is running' });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
