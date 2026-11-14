import { Request, Response, NextFunction } from 'express';
import { employeeService } from './employee.service';
import { queryEmployeesSchema } from './employee.schema';
import { AppError } from '../../errors/AppError';
import { Role } from '@prisma/client';

export class EmployeeController {
  listEmployees = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = queryEmployeesSchema.parse(req.query);
      const result = await employeeService.listEmployees(query, req.user!.role);

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

      // Privacy rule: standard employee can only view their own profile directly
      if (req.user!.role === Role.EMPLOYEE && req.user!.employeeId !== id) {
        throw AppError.forbidden('You can only view your own employee profile');
      }

      const employee = await employeeService.getEmployeeById(id, req.user!.role);

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
      const { employee, temporaryPassword } = await employeeService.createEmployee(req.body, req.user!.userId);

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