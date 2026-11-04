import bcrypt from 'bcryptjs';
import { Prisma, Role, EmploymentStatus, AuditAction } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  UpdateCompensationInput,
  QueryEmployeesInput,
} from './employee.schema';
import { encryptPassword, decryptPassword } from '../../utils/crypto';

export class EmployeeService {
  /**
   * Returns employees with pagination and filters.
   * If caller is CEO_ADMIN, includes compensation details.
   * If caller is PROJECT_MANAGER or EMPLOYEE, compensation is omitted.
   */
  async listEmployees(query: QueryEmployeesInput, callerRole: Role) {
    const { page, limit, search, department, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (department) {
      where.department = { contains: department, mode: 'insensitive' };
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const isCeo = callerRole === Role.CEO_ADMIN;

    const [total, items] = await prisma.$transaction([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          department: true,
          position: true,
          status: true,
          hireDate: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              isActive: true,
              managedPassword: isCeo ? true : undefined, // Only CEO_ADMIN can see the encrypted password
            },
          },
          // Conditionally include compensation ONLY for CEO_ADMIN
          compensation: isCeo
            ? {
              select: {
                baseHourlyRate: true,
                overtimeHourlyRate: true,
                currency: true,
                effectiveDate: true,
              },
            }
            : undefined,
        },
      }),
    ]);

    const sanitizedItems = items.map((emp) => {
      if (isCeo && emp.user?.managedPassword) {
        return {
          ...emp,
          user: {
            ...emp.user,
            managedPassword: decryptPassword(emp.user.managedPassword),
          },
        };
      }
      return emp;
    });

    return {
      data: sanitizedItems,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single employee by ID with strict role-based visibility.
   */
  async getEmployeeById(employeeId: string, callerRole: Role) {
    const isCeo = callerRole === Role.CEO_ADMIN;

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
        status: true,
        hireDate: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
        compensation: isCeo
          ? {
            select: {
              baseHourlyRate: true,
              overtimeHourlyRate: true,
              currency: true,
              effectiveDate: true,
            },
          }
          : false,
        projectMemberships: {
          select: {
            id: true,
            isProjectLead: true,
            project: {
              select: {
                id: true,
                code: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!employee) {
      throw AppError.notFound(`Employee with ID '${employeeId}' not found`);
    }

    return employee;
  }

  /**
   * Creates a User + Employee + Compensation record in a single transaction.
   * Locked to CEO_ADMIN only.
   */
  async createEmployee(input: CreateEmployeeInput, actorUserId: string) {
    // Check for unique email and employeeCode collisions upfront
    const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      throw AppError.conflict('An account with this email address already exists');
    }

    const existingCode = await prisma.employee.findUnique({
      where: { employeeCode: input.employeeCode },
    });
    if (existingCode) {
      throw AppError.conflict(`Employee code '${input.employeeCode}' is already in use`);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const managedPassword = encryptPassword(input.password); // <--- Encrypt for CEO retrieval

    const newEmployee = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          managedPassword,
          role: input.role,
          mustChangePassword: false,
        },
      });

      const employee = await tx.employee.create({
        data: {
          userId: user.id,
          employeeCode: input.employeeCode,
          firstName: input.firstName,
          lastName: input.lastName,
          department: input.department,
          position: input.position,
          status: EmploymentStatus.ACTIVE,
          hireDate: new Date(input.hireDate),
          compensation: {
            create: {
              baseHourlyRate: new Prisma.Decimal(input.compensation.baseHourlyRate),
              overtimeHourlyRate: new Prisma.Decimal(input.compensation.overtimeHourlyRate),
              currency: input.compensation.currency,
              effectiveDate: new Date(input.hireDate),
            },
          },
        },
        include: {
          user: { select: { id: true, email: true, role: true } },
          compensation: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.CREATE,
          entityName: 'Employee',
          entityId: employee.id,
          afterState: {
            employeeCode: employee.employeeCode,
            email: user.email,
            role: user.role,
          },
        },
      });

      return employee;
    });

    return newEmployee;
  }

  /**
   * Updates basic employee information.
   */
  async updateEmployee(employeeId: string, input: UpdateEmployeeInput, actorUserId: string) {
    const existing = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });
    if (!existing) throw AppError.notFound('Employee not found');

    // Check unique collision for email
    if (input.email && input.email !== existing.user.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: input.email } });
      if (emailTaken) throw AppError.conflict('Email address is already in use by another account');
    }

    // Check unique collision for employee code
    if (input.employeeCode && input.employeeCode !== existing.employeeCode) {
      const codeTaken = await prisma.employee.findUnique({ where: { employeeCode: input.employeeCode } });
      if (codeTaken) throw AppError.conflict(`Employee code '${input.employeeCode}' is already in use`);
    }

    const { email, ...employeeData } = input;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update User email if changed
      if (email) {
        await tx.user.update({
          where: { id: existing.userId },
          data: { email },
        });
      }

      // 2. Update Employee record
      const result = await tx.employee.update({
        where: { id: employeeId },
        data: employeeData,
      });

      if (input.status === EmploymentStatus.TERMINATED || input.status === EmploymentStatus.INACTIVE) {
        await tx.user.update({
          where: { id: existing.userId },
          data: { isActive: false, refreshTokenHash: null },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.UPDATE,
          entityName: 'Employee',
          entityId: employeeId,
          beforeState: existing as unknown as Prisma.JsonObject,
          afterState: result as unknown as Prisma.JsonObject,
        },
      });

      return result;
    });

    return updated;
  }

  async deleteEmployee(employeeId: string, actorUserId: string) {
    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) throw AppError.notFound('Employee not found');

    await prisma.$transaction(async (tx) => {
      // Delete linked User which cascades down
      await tx.user.delete({ where: { id: emp.userId } });
      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.DELETE,
          entityName: 'Employee',
          entityId: employeeId,
        },
      });
    });

    return { message: 'Employee successfully removed' };
  }

  /**
   * Updates an employee's password and logs the action.
   * Only CEO_ADMIN can perform this action.
   */
  async updateEmployeePassword(employeeId: string, newPass: string, actorUserId: string) {
    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) throw AppError.notFound('Employee not found');

    const passwordHash = await bcrypt.hash(newPass, 10);
    const managedPassword = encryptPassword(newPass);

    await prisma.user.update({
      where: { id: emp.userId },
      data: { passwordHash, managedPassword },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actorUserId,
        action: AuditAction.UPDATE,
        entityName: 'UserCredentials',
        entityId: emp.userId,
      },
    });

    return { message: 'Employee password updated successfully' };
  }

  /**
   * Strict CEO_ADMIN endpoint: Returns isolated compensation data.
   */
  async getCompensation(employeeId: string) {
    const comp = await prisma.compensation.findUnique({
      where: { employeeId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!comp) {
      throw AppError.notFound('Compensation profile not found for this employee');
    }

    return comp;
  }

  /**
   * Strict CEO_ADMIN endpoint: Updates compensation rates with audit log.
   */
  async updateCompensation(employeeId: string, input: UpdateCompensationInput, actorUserId: string) {
    const existing = await prisma.compensation.findUnique({ where: { employeeId } });
    if (!existing) {
      throw AppError.notFound('Compensation profile not found for this employee');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.compensation.update({
        where: { employeeId },
        data: {
          baseHourlyRate: new Prisma.Decimal(input.baseHourlyRate),
          overtimeHourlyRate: new Prisma.Decimal(input.overtimeHourlyRate),
          currency: input.currency,
          effectiveDate: new Date(input.effectiveDate),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.UPDATE,
          entityName: 'Compensation',
          entityId: result.id,
          beforeState: existing as unknown as Prisma.JsonObject,
          afterState: result as unknown as Prisma.JsonObject,
        },
      });

      return result;
    });

    return updated;
  }
}

export const employeeService = new EmployeeService();