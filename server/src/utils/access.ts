import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../errors/AppError';
import { TokenPayload } from './token';

/** True when the PM is lead on the given project. */
export const pmLeadsProject = async (pmEmployeeId: string, projectId: string) =>
  (await prisma.projectMember.count({
    where: { projectId, employeeId: pmEmployeeId, isProjectLead: true, removedAt: null },
  })) > 0;

/** True when the employee is a member of any project the PM leads. */
export const pmLeadsEmployee = async (pmEmployeeId: string, employeeId: string) =>
  (await prisma.projectMember.count({
    where: {
      employeeId,
      removedAt: null,
      project: { members: { some: { employeeId: pmEmployeeId, isProjectLead: true, removedAt: null } } },
    },
  })) > 0;

/**
 * Object-level check for data about one employee:
 * CEO: always; PM: only employees on projects they lead; employee: only themselves.
 */
export const assertCanViewEmployee = async (user: TokenPayload, employeeId: string) => {
  if (user.role === Role.CEO_ADMIN) return;
  if (user.employeeId === employeeId) return;
  if (user.role === Role.PROJECT_MANAGER && (await pmLeadsEmployee(user.employeeId, employeeId))) return;
  throw AppError.forbidden();
};
