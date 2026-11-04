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
        status: 'success',
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
        status: 'success',
        data: { employee },
      });
    } catch (error) {
      next(error);
    }
  };

  createEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employee = await employeeService.createEmployee(req.body, req.user!.userId);

      res.status(201).json({
        status: 'success',
        message: 'Employee successfully created',
        data: { employee },
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
        status: 'success',
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
      const result = await employeeService.deleteEmployee(id, req.user!.userId);

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  updateEmployeePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { password } = req.body;
      const result = await employeeService.updateEmployeePassword(id, password, req.user!.userId);
      res.status(200).json({ status: 'success', message: result.message });
    } catch (error) {
      next(error);
    }
  };

  getCompensation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const compensation = await employeeService.getCompensation(id);

      res.status(200).json({
        status: 'success',
        data: { compensation },
      });
    } catch (error) {
      next(error);
    }
  };

  updateCompensation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updated = await employeeService.updateCompensation(id, req.body, req.user!.userId);

      res.status(200).json({
        status: 'success',
        message: 'Compensation successfully updated',
        data: { compensation: updated },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const employeeController = new EmployeeController();