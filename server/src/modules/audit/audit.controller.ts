import { Request, Response, NextFunction } from 'express';
import { auditService } from './audit.service';
import { queryAuditLogsSchema } from './audit.schema';

export class AuditController {
  getLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = queryAuditLogsSchema.parse(req.query);
      const result = await auditService.listLogs(
        query,
        req.user!.role,
        req.user!.userId
      );

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const auditController = new AuditController();