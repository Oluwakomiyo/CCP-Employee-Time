import { Request, Response, NextFunction } from 'express';
import { assertCanViewEmployee } from '../../utils/access';
import { activityService } from './activity.service';
import {
  browserHeartbeatSchema,
  agentHeartbeatSchema,
  registerDeviceSchema,
} from './activity.schema';
import { AppError } from '../../errors/AppError';

export class ActivityController {
  // Browser Heartbeat (Called from Web Client)
  recordBrowserHeartbeat = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = browserHeartbeatSchema.parse(req.body);
      const result = await activityService.recordBrowserHeartbeat(
        req.user!.employeeId,
        input
      );

      res.status(200).json({ success: true, data: result });
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

      res.status(200).json({ success: true, data: result });
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
        success: true,
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

      // Employees: own only. PMs: employees on projects they lead (spec §111).
      await assertCanViewEmployee(req.user!, summary.employee.id);

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const activityController = new ActivityController();