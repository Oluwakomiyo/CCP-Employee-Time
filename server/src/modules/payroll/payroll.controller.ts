import { Request, Response, NextFunction } from 'express';
import { payrollService } from './payroll.service';
import { generatePayrollSchema, queryPayrollSchema } from './payroll.schema';

export class PayrollController {
  generatePayroll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = generatePayrollSchema.parse(req.body);
      const records = await payrollService.generatePayroll(input, req.user!.userId);

      res.status(201).json({
        status: 'success',
        message: `Successfully generated ${records.length} payroll records`,
        data: { payrollRecords: records },
      });
    } catch (error) {
      next(error);
    }
  };

  listPayroll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = queryPayrollSchema.parse(req.query);
      const result = await payrollService.listPayrollRecords(query);

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  getMyPaySlips = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await payrollService.getMyPaySlips(req.user!.employeeId, page, limit);

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const payrollController = new PayrollController();