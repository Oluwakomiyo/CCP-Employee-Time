import { Router, Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { reportService } from './report.service';
import { estimateQuerySchema, idParamSchema, rangeQuerySchema } from './report.schema';

type Handler = (req: Request) => Promise<unknown>;
const send = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e) {
    next(e);
  }
};

/** /api/v1/management/*: CEO and project managers only (deny by default, spec §4). */
export const managementRouter = Router();
managementRouter.use(authenticate, authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER));

managementRouter.get('/dashboard', send((req) => reportService.dashboard(req.user!, rangeQuerySchema.parse(req.query))));
managementRouter.get('/status', send((req) => reportService.liveStatus(req.user!)));
managementRouter.get(
  '/projects/:id/report',
  send((req) => reportService.projectReport(req.user!, idParamSchema.parse(req.params).id, rangeQuerySchema.parse(req.query)))
);
managementRouter.get(
  '/employees/:id/report',
  send((req) => reportService.employeeReport(req.user!, idParamSchema.parse(req.params).id, rangeQuerySchema.parse(req.query)))
);
managementRouter.get(
  '/estimate',
  send((req) => {
    const q = estimateQuerySchema.parse(req.query);
    return reportService.estimate(req.user!, q.projectId, q.employeeIds);
  })
);

/** GET /api/v1/me/report: the employee's own restricted report (spec §35), no money. */
export const myReportHandler = [
  authenticate,
  send((req) => reportService.employeeReport(req.user!, req.user!.employeeId, rangeQuerySchema.parse(req.query))),
];
