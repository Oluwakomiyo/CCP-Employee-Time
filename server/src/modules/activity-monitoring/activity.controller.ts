import { Request, Response, NextFunction } from 'express';
import { activityService } from './activity.service';
import {
  browserHeartbeatSchema,
  agentHeartbeatSchema,
  registerDeviceSchema,
} from './activity.schema';
import { AppError } from '../../errors/AppError';
import { Role } from '@prisma/client';

export class ActivityController {
  // Browser Heartbeat (Called from Web Client)
  recordBrowserHeartbeat = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = browserHeartbeatSchema.parse(req.body);
      const result = await activityService.recordBrowserHeartbeat(
        req.user!.employeeId,
        input
      );

      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  // Desktop Agent Heartbeat
  recordAgentHeartbeat = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers['x-device-key'] as string;
      if (!apiKey) {
        throw AppError.unauthorized('Missing X-Device-Key header');
      }

      const input = agentHeartbeatSchema.parse(req.body);
      const result = await activityService.recordAgentHeartbeat(apiKey, input);

      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };

  // Register Device (Management only)
  registerDevice = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = registerDeviceSchema.parse(req.body);
      const result = await activityService.registerDevice(input);

      res.status(201).json({
        status: 'success',
        message: 'Device successfully registered for activity evidence',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // Workday Evidence Summary (Management view)
  getWorkEvidence = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params; // workDayId
      const summary = await activityService.getWorkEvidenceSummary(id);

      // Privacy check: standard employees can only view their own evidence
      if (req.user!.role === Role.EMPLOYEE && req.user!.employeeId !== summary.employee.id) {
        throw AppError.forbidden('You are not authorized to view this employee\'s telemetry evidence');
      }

      res.status(200).json({
        status: 'success',
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const activityController = new ActivityController();