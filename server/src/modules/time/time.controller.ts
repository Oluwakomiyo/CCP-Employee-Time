import { Request, Response, NextFunction } from 'express';
import { timeService } from './time.service';
import { staleSessionService } from './stale-session.service';
import { timeHistoryQuerySchema } from './time.schema';

export class TimeController {
  clockIn = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ipAddress = req.ip || req.socket.remoteAddress;
      const segment = await timeService.clockIn(
        req.user!.employeeId,
        req.body,
        req.user!.role,
        req.user!.userId,
        ipAddress
      );

      res.status(201).json({
        status: 'success',
        message: 'Successfully clocked in',
        data: { segment },
      });
    } catch (error) {
      next(error);
    }
  };

  clockOut = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ipAddress = req.ip || req.socket.remoteAddress;
      const segment = await timeService.clockOut(
        req.user!.employeeId,
        req.user!.userId,
        ipAddress
      );

      res.status(200).json({
        status: 'success',
        message: 'Successfully clocked out',
        data: { segment },
      });
    } catch (error) {
      next(error);
    }
  };

  startBreak = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const breakRecord = await timeService.startBreak(
        req.user!.employeeId,
        req.body,
        req.user!.userId
      );

      res.status(201).json({
        status: 'success',
        message: 'Break started',
        data: { break: breakRecord },
      });
    } catch (error) {
      next(error);
    }
  };

  endBreak = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const breakRecord = await timeService.endBreak(
        req.user!.employeeId,
        req.user!.userId
      );

      res.status(200).json({
        status: 'success',
        message: 'Break ended',
        data: { break: breakRecord },
      });
    } catch (error) {
      next(error);
    }
  };

  logActivity = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const activity = await timeService.logActivity(
        req.user!.employeeId,
        req.body
      );

      res.status(201).json({
        status: 'success',
        message: 'Activity recorded successfully',
        data: { activity },
      });
    } catch (error) {
      next(error);
    }
  };

  getStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await timeService.getCurrentStatus(req.user!.employeeId);

      res.status(200).json({
        status: 'success',
        data: status,
      });
    } catch (error) {
      next(error);
    }
  };

  getHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = timeHistoryQuerySchema.parse(req.query);
      const history = await timeService.getTimesheetHistory(
        query,
        req.user!.role,
        req.user!.employeeId
      );

      res.status(200).json({
        status: 'success',
        data: { history },
      });
    } catch (error) {
      next(error);
    }
  };

  // ---------------------------------------------------------------------------
  // PHASE 7: MISSING CLOCK-OUT RESOLUTION
  // ---------------------------------------------------------------------------

  triggerAutoClose = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cutoffHours = req.query.cutoffHours
        ? parseInt(req.query.cutoffHours as string, 10)
        : 16;
      const defaultShiftHours = req.query.defaultHours
        ? parseInt(req.query.defaultHours as string, 10)
        : 8;

      const result = await staleSessionService.autoCloseStaleSessions(
        cutoffHours,
        defaultShiftHours
      );

      res.status(200).json({
        status: 'success',
        message: `Processed stale sessions: ${result.closedCount} closed`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getFlaggedDays = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const flagged = await staleSessionService.getFlaggedWorkDays(
        req.user!.role,
        req.user!.employeeId
      );

      res.status(200).json({
        status: 'success',
        data: { flaggedWorkDays: flagged },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const timeController = new TimeController();