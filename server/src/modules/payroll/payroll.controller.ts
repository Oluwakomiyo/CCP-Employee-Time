import { Request, Response, NextFunction } from 'express';
import { payrollService } from './payroll.service';
import { generatePayrollSchema, periodSchema, queryPayrollSchema } from './payroll.schema';

export class PayrollController {
  generatePayroll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = generatePayrollSchema.parse(req.body);
      const { records, skippedFinalized, daysWithoutRate } = await payrollService.generatePayroll(input, req.user!.userId);
      res.status(201).json({
        success: true,
        message: `Generated ${records.length} draft payroll record(s)`,
        // `payrollRecords` kept for the legacy client.
        data: { payrollRecords: records, skippedFinalized, daysWithoutRate },
      });
    } catch (error) {
      next(error);
    }
  };

  finalizePeriod = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await payrollService.finalizePeriod(periodSchema.parse(req.body), req.user!.userId) });
    } catch (error) {
      next(error);
    }
  };

  exportCsv = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const period = periodSchema.parse(req.query);
      const csv = await payrollService.exportCsv(period);
      res
        .status(200)
        .type('text/csv')
        .set('Content-Disposition', `attachment; filename="payroll_${period.periodStart}_${period.periodEnd}.csv"`)
        .set('Cache-Control', 'no-store')
        .send(csv);
    } catch (error) {
      next(error);
    }
  };

  listPayroll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await payrollService.listPayrollRecords(queryPayrollSchema.parse(req.query));
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}

export const payrollController = new PayrollController();
