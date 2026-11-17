import { Request, Response, NextFunction } from 'express';
import { assertCanSee } from '../../utils/access';
import { activityService } from './activity.service';
import {
  browserHeartbeatSchema,
  agentHeartbeatSchema,
  registerDeviceSchema,
  enrollDeviceSchema,
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
  // The desktop app enrolling its own computer for the signed-in person.
  enrollDevice = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = enrollDeviceSchema.parse(req.body);
      const result = await activityService.enrollDevice(req.user!.employeeId, req.user!.userId, input);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  registerDevice = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = registerDeviceSchema.parse(req.body);
      const result = await activityService.registerDevice(input, req.user!.userId);

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

      // Own day always; others need evidence.view covering them (TEAM: projects you lead, spec §111).
      await assertCanSee(req.user!, 'evidence.view', summary.employee.id);

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