import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
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
  app.use(helmet());
  app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.status(200).json({
      message: 'Employee Time Management API is running',
    });
  });


  // Health check route
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
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
  
  // Centralized Error Handling (must be last middleware)
  app.use(errorHandler);

  return app;
};