import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { employeeRouter } from './modules/employees/employee.routes';
import { projectRouter } from './modules/projects/project.routes';
import { timeRouter } from './modules/time/time.routes';
import { activityRouter } from './modules/activity-monitoring/activity.routes';
import { correctionRouter } from './modules/corrections/correction.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { payrollRouter } from './modules/payroll/payroll.routes';
import { activityController } from './modules/activity-monitoring/activity.controller';
import { authenticate } from './middleware/auth.middleware';

export const createApp = (): Express => {
  const app = express();

  // Basic security middleware
  // Behind one reverse proxy in production, so req.ip is the client address.
  app.set('trust proxy', 1);
  app.use(helmet());
  const origins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Brute-force protection on credential endpoints (per IP).
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again later.' } },
  });
  app.use(['/api/v1/auth/login', '/api/v1/auth/refresh'], authLimiter);

  app.get('/', (_req, res) => {
    res.status(200).json({
      message: 'Employee Time Management API is running',
    });
  });


  // Health check route
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'employee-time-management-api',
      timestamp: new Date().toISOString(),
    });
  });

  // Canonical Section 92 Browser Heartbeat alias
  app.post('/api/v1/time/heartbeat', authenticate, activityController.recordBrowserHeartbeat);

  // REST API v1 Routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/employees', employeeRouter);
  app.use('/api/v1/projects', projectRouter);
  app.use('/api/v1/time', timeRouter);
  app.use('/api/v1/activity', activityRouter);
  app.use('/api/v1/corrections', correctionRouter);
  app.use('/api/v1/audit', auditRouter);
  app.use('/api/v1/payroll', payrollRouter);
  
  app.use(notFoundHandler);
  // Centralized Error Handling (must be last middleware)
  app.use(errorHandler);

  return app;
};