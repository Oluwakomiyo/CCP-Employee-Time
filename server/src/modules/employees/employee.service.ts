import bcrypt from 'bcryptjs';
import { Prisma, Role, EmploymentStatus, AuditAction } from '@prisma/client';
import { prisma, DbClient } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  UpdateCompensationInput,
  QueryEmployeesInput,
} from './employee.schema';
import { systemRoleKey } from '../../auth/permissions';
import { AuthUser, can, toGrants } from '../../auth/can';
import { assertCanAssign } from '../roles/role.service';
import { visibleEmployeeIds } from '../../utils/access';
import { generateTemporaryPassword } from '../../utils/password';
import { CURRENT_RATE, dayBefore } from './compensation';

/** Departments are managed in Settings; an unknown name is a mistake, not a new department. */
const ensureDepartment = async (tx: DbClient, name: string) => {
  if (!(await tx.department.findUnique({ where: { name }, select: { id: true } }))) {
    throw new AppError(`Unknown department '${name}'. Add it in Settings first.`, 400, undefined, 'UNKNOWN_DEPARTMENT');
  }
};

/** Positions are managed in Settings, like departments. */
const ensurePosition = async (tx: DbClient, name: string) => {
  if (!(await tx.position.findUnique({ where: { name }, select: { id: true } }))) {
    throw new AppError(`Unknown position '${name}'. Add it in Settings first.`, 400, undefined, 'UNKNOWN_POSITION');
  }
};

/** Next free system number: EMP-001, EMP-002, ... (EMP-1000 after 999). The sequence makes it race-free;
 *  the loop only skips a number someone already typed by hand. */
const nextEmployeeCode = async (tx: DbClient) => {
  for (;;) {
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('employee_code_seq') AS n`;
    const code = `EMP-${String(n).padStart(3, '0')}`;
    if (!(await tx.employee.findUnique({ where: { employeeCode: code }, select: { id: true } }))) return code;
  }
};

/** Current rate only, for CEO views. */
const currentRateSelect = {
  where: CURRENT_RATE,
  take: 1,
  select: { baseHourlyRate: true, overtimeHourlyRate: true, currency: true, effectiveFrom: true },
} as const;

/** Flattens `compensations: [current]` into `compensation` (null when absent). */
const withCurrentRate = <T extends { compensations?: unknown[] }>(e: T) => {
  const { compensations, ...rest } = e;
  return compensations === undefined ? rest : { ...rest, compensation: compensations[0] ?? null };
};

export class EmployeeService {
  /**
   * Returns employees with pagination and filters.
   * If caller is CEO_ADMIN, includes compensation details.
   * If caller is PROJECT_MANAGER or EMPLOYEE, compensation is omitted.
   */
  async listEmployees(query: QueryEmployeesInput, caller: AuthUser) {
    const { page, limit, search, department, status, sort, order } = query;
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

    // Pay rates only with compensation.view (spec §4).
    const isCeo = can(caller, 'compensation.view');
    // TEAM scope: only people on projects the caller leads (plus themselves).
    const ids = await visibleEmployeeIds(caller, 'employees.view');
    if (ids) where.id = { in: ids };

    const [total, items] = await prisma.$transaction([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
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
              mustChangePassword: true,
            },
          },
          // Compensation ONLY for CEO_ADMIN (spec §4)
          compensations: isCeo ? currentRateSelect : undefined,
        },
      }),
    ]);

    return {
      data: items.map(withCurrentRate),
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
  async getEmployeeById(employeeId: string, caller: AuthUser) {
    const isCeo = can(caller, 'compensation.view');

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
        compensations: isCeo ? currentRateSelect : false,
        projectMemberships: {
          where: { removedAt: null },
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

    return withCurrentRate(employee);
  }

  /**
   * Creates a User + Employee + Compensation record in a single transaction.
   * Locked to CEO_ADMIN only.
   */
  async createEmployee(input: CreateEmployeeInput, actorUserId: string, actor?: AuthUser) {
    // Check for an email collision upfront; the employee number is issued below
    const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      throw AppError.conflict('An account with this email address already exists');
    }

    // The chosen role must exist, and must not give more access than the creator has (unless they manage roles).
    const target = input.roleId
      ? await prisma.appRole.findUnique({ where: { id: input.roleId }, select: { presetOf: true, permissions: { select: { permission: true, scope: true } } } })
      : await prisma.appRole.findUnique({ where: { key: systemRoleKey(input.role) }, select: { presetOf: true, permissions: { select: { permission: true, scope: true } } } });
    if (!target) throw AppError.badRequest('Unknown role');
    if (actor) assertCanAssign(actor, toGrants(target.permissions));

    // The system generates the temporary password; only its hash is stored (spec §5).
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const newEmployee = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: target?.presetOf ?? (input.roleId ? Role.EMPLOYEE : input.role),
          appRole: input.roleId ? { connect: { id: input.roleId } } : { connect: { key: systemRoleKey(input.role) } },
          mustChangePassword: true,
        },
      });

      await ensureDepartment(tx, input.department);
      await ensurePosition(tx, input.position);
      const employee = await tx.employee.create({
        data: {
          userId: user.id,
          employeeCode: await nextEmployeeCode(tx),
          firstName: input.firstName,
          lastName: input.lastName,
          department: input.department,
          position: input.position,
          status: EmploymentStatus.ACTIVE,
          hireDate: new Date(input.hireDate),
          compensations: {
            create: {
              baseHourlyRate: new Prisma.Decimal(input.compensation.baseHourlyRate),
              overtimeHourlyRate: new Prisma.Decimal(input.compensation.overtimeHourlyRate),
              currency: input.compensation.currency,
              effectiveFrom: new Date(input.hireDate),
            },
          },
        },
        include: {
          user: { select: { id: true, email: true, role: true } },
          compensations: true,
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

    // Returned exactly once so the CEO can hand it over; it is never retrievable again.
    return { employee: newEmployee, temporaryPassword };
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
      if (employeeData.department) await ensureDepartment(tx, employeeData.department);
      if (employeeData.position) await ensurePosition(tx, employeeData.position);
      const result = await tx.employee.update({
        where: { id: employeeId },
        data: employeeData,
      });

      if (input.status === EmploymentStatus.TERMINATED || input.status === EmploymentStatus.INACTIVE) {
        await tx.user.update({
          where: { id: existing.userId },
          data: { isActive: false, refreshTokenHash: null },
        });
      } else if (input.status === EmploymentStatus.ACTIVE || input.status === EmploymentStatus.ON_LEAVE) {
        await tx.user.update({ where: { id: existing.userId }, data: { isActive: true } });
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

  /**
   * Deactivates an employee. Records are never hard-deleted: time, payroll and audit
   * history must survive (spec §22, §76).
   */
  async deactivateEmployee(employeeId: string, actorUserId: string) {
    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) throw AppError.notFound('Employee not found');
    if (emp.userId === actorUserId) throw AppError.badRequest('You cannot deactivate your own account');

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id: employeeId }, data: { status: EmploymentStatus.INACTIVE } });
      await tx.user.update({ where: { id: emp.userId }, data: { isActive: false, refreshTokenHash: null } });
      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.UPDATE,
          entityName: 'Employee',
          entityId: employeeId,
          beforeState: { status: emp.status },
          afterState: { status: EmploymentStatus.INACTIVE, event: 'EMPLOYEE_DEACTIVATED' },
        },
      });
    });

    return { message: 'Employee deactivated' };
  }

  /**
   * Updates an employee's password and logs the action.
   * Only CEO_ADMIN can perform this action.
   */
  /**
   * Issues a new temporary password (shown once), forces a change at next login,
   * and signs the user out everywhere.
   */
  async resetEmployeePassword(employeeId: string, actorUserId: string) {
    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) throw AppError.notFound('Employee not found');

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: emp.userId },
        data: { passwordHash, mustChangePassword: true, refreshTokenHash: null },
      }),
      prisma.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.UPDATE,
          entityName: 'UserCredentials',
          entityId: emp.userId,
          afterState: { event: 'PASSWORD_RESET' },
        },
      }),
    ]);

    return { temporaryPassword };
  }

  /**
   * CEO only: current rate plus full history, newest first.
   */
  async getCompensation(employeeId: string) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        compensations: { orderBy: { effectiveFrom: 'desc' } },
      },
    });
    if (!employee) throw AppError.notFound('Employee not found');

    const { compensations, ...profile } = employee;
    return {
      employee: profile,
      current: compensations.find((c) => c.effectiveTo === null) ?? null,
      history: compensations,
    };
  }

  /**
   * CEO only: a rate change never overwrites history (spec §20). The current rate is closed the
   * day before `effectiveDate` and a new open rate starts on it. Audited as COMPENSATION_CHANGED.
   */
  async updateCompensation(employeeId: string, input: UpdateCompensationInput, actorUserId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw AppError.notFound('Employee not found');

    const effectiveFrom = new Date(`${input.effectiveDate}T00:00:00.000Z`);

    return prisma.$transaction(async (tx) => {
      const current = await tx.compensation.findFirst({ where: { employeeId, ...CURRENT_RATE } });
      if (current && effectiveFrom <= current.effectiveFrom) {
        throw AppError.badRequest(
          `The new rate must start after the current rate's start date (${current.effectiveFrom.toISOString().slice(0, 10)})`
        );
      }
      if (current) {
        await tx.compensation.update({ where: { id: current.id }, data: { effectiveTo: dayBefore(effectiveFrom) } });
      }

      const created = await tx.compensation.create({
        data: {
          employeeId,
          baseHourlyRate: new Prisma.Decimal(input.baseHourlyRate),
          overtimeHourlyRate: new Prisma.Decimal(input.overtimeHourlyRate),
          currency: input.currency,
          effectiveFrom,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.UPDATE,
          entityName: 'Compensation',
          entityId: created.id,
          beforeState: current
            ? { baseHourlyRate: current.baseHourlyRate, overtimeHourlyRate: current.overtimeHourlyRate, currency: current.currency, effectiveFrom: current.effectiveFrom }
            : Prisma.JsonNull,
          afterState: {
            event: 'COMPENSATION_CHANGED',
            employeeId,
            baseHourlyRate: created.baseHourlyRate,
            overtimeHourlyRate: created.overtimeHourlyRate,
            currency: created.currency,
            effectiveFrom: input.effectiveDate,
          } as unknown as Prisma.JsonObject,
        },
      });

      return created;
    });
  }
}

export const employeeService = new EmployeeService();