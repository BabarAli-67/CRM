import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import helmet from 'helmet';
import env from './config/env.config.js';
import { notFound, errorHandler } from './middlewares/error.middleware.js';
import authRoutes from './routes/auth.route.js';
import adminRoutes from './routes/admin.route.js';
import shiftRoutes from './routes/shift.route.js';
import attendanceRoutes from './routes/attendance.route.js';
import callbackRoutes from './routes/callback.routes.js';
import leadRoutes from './routes/lead.routes.js';
import statsRoutes from './routes/stats.routes.js';
import handoverRoutes from './routes/handover.routes.js';
import reportRoutes from './routes/report.routes.js';
import userRoutes from './routes/user.routes.js';

const app = express();

// Required behind Render / reverse proxies for secure cookies + rate limiting
app.set('trust proxy', 1);

const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Flash Digital CRM API is running',
    env: env.NODE_ENV,
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/shift', shiftRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/callbacks', callbackRoutes);
app.use('/api/v1/leads', leadRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/handover', handoverRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/users', userRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
