import { Request, Response, NextFunction } from 'express';
import { timeService, TimeActor } from './time.service';
import { staleSessionService } from './stale-session.service';
import { autoCloseQuerySchema, timeHistoryQuerySchema } from './time.schema';

const actorOf = (req: Request): TimeActor => ({
  employeeId: req.user!.employeeId,
  userId: req.user!.userId,
  role: req.user!.role,
  ip: req.ip,
});

/** Wraps a time action: runs it and returns the employee's fresh status. */
const action =
  (fn: (actor: TimeActor, body: any) => Promise<unknown>, status = 200) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fn(actorOf(req), req.body);
      res.status(status).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

export class TimeController {
  startWork = action((a, b) => timeService.startWork(a, b), 201);
  changeProject = action((a, b) => timeService.changeProject(a, b));
  changeLocation = action((a, b) => timeService.changeLocation(a, b));
  changeActivity = action((a, b) => timeService.changeActivity(a, b));
  startBreak = action((a, b) => timeService.startBreak(a, b), 201);
  endBreak = action((a) => timeService.endBreak(a));
  endWork = action((a) => timeService.endWork(a));

  getToday = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({ success: true, data: await timeService.getToday(req.user!.employeeId) });
    } catch (error) {
      next(error);
    }
  };

  getHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = timeHistoryQuerySchema.parse(req.query);
      const history = await timeService.getTimesheetHistory(query, req.user!.role, req.user!.employeeId);
      res.status(200).json({ success: true, data: { history } });
    } catch (error) {
      next(error);
    }
  };

  triggerAutoClose = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { cutoffHours } = autoCloseQuerySchema.parse(req.query);
      const result = await staleSessionService.flagMissingClockOuts(cutoffHours, req.user!.userId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  getFlaggedDays = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const flagged = await staleSessionService.getFlaggedWorkDays(req.user!.role, req.user!.employeeId);
      res.status(200).json({ success: true, data: { flaggedWorkDays: flagged } });
    } catch (error) {
      next(error);
    }
  };
}

export const timeController = new TimeController();
