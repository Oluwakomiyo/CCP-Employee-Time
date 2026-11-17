import { assertCanSee } from '../../utils/access';
import { Request, Response, NextFunction } from 'express';
import { employeeService } from './employee.service';
import { queryEmployeesSchema } from './employee.schema';
import { AppError } from '../../errors/AppError';

export class EmployeeController {
  listEmployees = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = queryEmployeesSchema.parse(req.query);
      const result = await employeeService.listEmployees(query, req.user!);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  getEmployeeById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Yourself always; others need employees.view covering them (TEAM: people on projects you lead).
      await assertCanSee(req.user!, 'employees.view', id);

      const employee = await employeeService.getEmployeeById(id, req.user!);

      res.status(200).json({
        success: true,
        data: { employee },
      });
    } catch (error) {
      next(error);
    }
  };

  createEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { employee, temporaryPassword } = await employeeService.createEmployee(req.body, req.user!.userId, req.user!);

      res.status(201).json({
        success: true,
        message: 'Employee successfully created',
        data: { employee, temporaryPassword },
      });
    } catch (error) {
      next(error);
    }
  };

  updateEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updated = await employeeService.updateEmployee(id, req.body, req.user!.userId);

      res.status(200).json({
        success: true,
        message: 'Employee successfully updated',
        data: { employee: updated },
      });
    } catch (error) {
      next(error);
    }
  };

  deleteEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await employeeService.deactivateEmployee(id, req.user!.userId);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  updateEmployeePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await employeeService.resetEmployeePassword(id, req.user!.userId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  getCompensation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      // { employee, current, history }
      res.status(200).json({ success: true, data: await employeeService.getCompensation(id) });
    } catch (error) {
      next(error);
    }
  };

  updateCompensation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updated = await employeeService.updateCompensation(id, req.body, req.user!.userId);

      res.status(200).json({
        success: true,
        message: 'Compensation successfully updated',
        data: { compensation: updated },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const employeeController = new EmployeeController();