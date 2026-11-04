import { Prisma, Role, AuditAction } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import {
  CreateProjectInput,
  UpdateProjectInput,
  AssignMemberInput,
  QueryProjectsInput,
} from './project.schema';

export class ProjectService {
  /**
   * List projects with role-scoped filtering:
   * - CEO_ADMIN / PROJECT_MANAGER: can view all company projects.
   * - EMPLOYEE: can only view projects where they are assigned.
   */
  async listProjects(
    query: QueryProjectsInput,
    userRole: Role,
    userEmployeeId?: string
  ) {
    const { page, limit, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProjectWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Restrict standard employees to only their assigned projects
    if (userRole === Role.EMPLOYEE) {
      if (!userEmployeeId) {
        return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
      }
      where.members = {
        some: {
          employeeId: userEmployeeId,
        },
      };
    }

    const [total, items] = await prisma.$transaction([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              members: true,
              workSegments: true,
            },
          },
          members: {
            take: 5,
            select: {
              id: true,
              isProjectLead: true,
              employee: {
                select: {
                  id: true,
                  employeeCode: true,
                  firstName: true,
                  lastName: true,
                  department: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single project details with all assigned team members.
   */
  async getProjectById(projectId: string, userRole: Role, userEmployeeId?: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                department: true,
                position: true,
                status: true,
              },
            },
          },
          orderBy: { isProjectLead: 'desc' },
        },
        _count: {
          select: {
            workSegments: true,
            activities: true,
          },
        },
      },
    });

    if (!project) {
      throw AppError.notFound(`Project with ID '${projectId}' not found`);
    }

    // Invariant: Employee cannot view projects they are not assigned to
    if (userRole === Role.EMPLOYEE) {
      const isMember = project.members.some((m) => m.employeeId === userEmployeeId);
      if (!isMember) {
        throw AppError.forbidden('You are not assigned to this project');
      }
    }

    return project;
  }

  /**
   * Create a project.
   */
  async createProject(input: CreateProjectInput, actorUserId: string, actorEmployeeId?: string) {
    const existing = await prisma.project.findUnique({ where: { code: input.code } });
    if (existing) {
      throw AppError.conflict(`Project code '${input.code}' is already in use`);
    }

    const newProject = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description,
          startDate: new Date(input.startDate),
          endDate: input.endDate ? new Date(input.endDate) : null,
        },
      });

      // If created by a Project Manager, assign them automatically as Lead
      if (actorEmployeeId) {
        const actorUser = await tx.user.findUnique({ where: { id: actorUserId } });
        if (actorUser?.role === Role.PROJECT_MANAGER) {
          await tx.projectMember.create({
            data: {
              projectId: project.id,
              employeeId: actorEmployeeId,
              isProjectLead: true,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.CREATE,
          entityName: 'Project',
          entityId: project.id,
          afterState: project as unknown as Prisma.JsonObject,
        },
      });

      return project;
    });

    return newProject;
  }

  /**
   * Update project metadata.
   */
  async updateProject(
    projectId: string,
    input: UpdateProjectInput,
    actorUserId: string,
    actorRole: Role,
    actorEmployeeId?: string
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true },
    });

    if (!project) {
      throw AppError.notFound(`Project with ID '${projectId}' not found`);
    }

    // PM can only update if they are the designated Project Lead
    if (actorRole === Role.PROJECT_MANAGER) {
      const isLead = project.members.some(
        (m) => m.employeeId === actorEmployeeId && m.isProjectLead
      );
      if (!isLead) {
        throw AppError.forbidden('Only the assigned Project Lead or CEO can update this project');
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.project.update({
        where: { id: projectId },
        data: {
          name: input.name,
          description: input.description,
          isActive: input.isActive,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate:
            input.endDate === null
              ? null
              : input.endDate
                ? new Date(input.endDate)
                : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.UPDATE,
          entityName: 'Project',
          entityId: projectId,
          beforeState: project as unknown as Prisma.JsonObject,
          afterState: result as unknown as Prisma.JsonObject,
        },
      });

      return result;
    });

    return updated;
  }

  /**
 * Delete a project. Checks that no active work segment is running.
 */
  async deleteProject(projectId: string, actorUserId: string) {
    const activeSegments = await prisma.workSegment.findFirst({
      where: { projectId, status: 'ACTIVE' },
    });

    if (activeSegments) {
      throw AppError.conflict('Cannot delete project while an employee is actively clocked into it.');
    }

    await prisma.$transaction(async (tx) => {
      // Delete memberships & segments
      await tx.projectMember.deleteMany({ where: { projectId } });
      await tx.activity.deleteMany({ where: { projectId } });
      await tx.workSegment.deleteMany({ where: { projectId } });
      await tx.project.delete({ where: { id: projectId } });

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.DELETE,
          entityName: 'Project',
          entityId: projectId,
        },
      });
    });

    return { message: 'Project successfully deleted' };
  }

  /**
   * Calculates time spent by each employee on this project, their individual earnings,
   * and the total project cost to date based on hourly rates (CEO only gets financials, PM gets hours).
   */
  async getProjectCostBreakdown(projectId: string, callerRole: Role) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        workSegments: {
          where: { status: { in: ['COMPLETED', 'AUTO_CLOSED'] } },
          include: {
            workDay: {
              include: {
                employee: {
                  include: { compensation: true },
                },
              },
            },
          },
        },
      },
    });

    if (!project) throw AppError.notFound('Project not found');

    const employeeMap = new Map<string, {
      employeeId: string;
      employeeCode: string;
      name: string;
      totalSeconds: number;
      baseHourlyRate: number;
      cost: number;
    }>();

    let totalProjectSeconds = 0;
    let totalProjectCost = 0;
    const isCeo = callerRole === Role.CEO_ADMIN;

    for (const seg of project.workSegments) {
      const emp = seg.workDay.employee;
      const duration = seg.durationSeconds || 0;
      totalProjectSeconds += duration;

      const baseRate = isCeo && emp.compensation ? Number(emp.compensation.baseHourlyRate) : 0;
      const segmentCost = isCeo ? (duration / 3600) * baseRate : 0;
      totalProjectCost += segmentCost;

      if (!employeeMap.has(emp.id)) {
        employeeMap.set(emp.id, {
          employeeId: emp.id,
          employeeCode: emp.employeeCode,
          name: `${emp.firstName} ${emp.lastName}`,
          totalSeconds: 0,
          baseHourlyRate: baseRate,
          cost: 0,
        });
      }

      const current = employeeMap.get(emp.id)!;
      current.totalSeconds += duration;
      current.cost += segmentCost;
    }

    return {
      projectId: project.id,
      projectName: project.name,
      projectCode: project.code,
      totalHours: Math.round((totalProjectSeconds / 3600) * 100) / 100,
      totalProjectCost: isCeo ? Math.round(totalProjectCost * 100) / 100 : null,
      employeeBreakdown: Array.from(employeeMap.values()).map((e) => ({
        ...e,
        totalHours: Math.round((e.totalSeconds / 3600) * 100) / 100,
        cost: isCeo ? Math.round(e.cost * 100) / 100 : null,
      })),
    };
  }

  /**
   * Assign an employee to a project team.
   */
  async assignMember(
    projectId: string,
    input: AssignMemberInput,
    actorUserId: string,
    actorRole: Role,
    actorEmployeeId?: string
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true },
    });

    if (!project) {
      throw AppError.notFound(`Project not found`);
    }

    // PM must be a lead of the project to add team members
    if (actorRole === Role.PROJECT_MANAGER) {
      const isLead = project.members.some(
        (m) => m.employeeId === actorEmployeeId && m.isProjectLead
      );
      if (!isLead) {
        throw AppError.forbidden('Only the Project Lead or CEO can assign team members');
      }
    }

    // Check employee exists and is active
    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
    });

    if (!employee || employee.status !== 'ACTIVE') {
      throw AppError.badRequest('Target employee does not exist or is not active');
    }

    // Check if membership already exists
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        projectId_employeeId: {
          projectId,
          employeeId: input.employeeId,
        },
      },
    });

    if (existingMember) {
      throw AppError.conflict('Employee is already assigned to this project');
    }

    const membership = await prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.create({
        data: {
          projectId,
          employeeId: input.employeeId,
          isProjectLead: input.isProjectLead,
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              department: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.CREATE,
          entityName: 'ProjectMember',
          entityId: member.id,
          afterState: {
            projectId,
            employeeId: input.employeeId,
            isProjectLead: input.isProjectLead,
          },
        },
      });

      return member;
    });

    return membership;
  }

  /**
   * Remove an employee from a project.
   */
  async removeMember(
    projectId: string,
    targetEmployeeId: string,
    actorUserId: string,
    actorRole: Role,
    actorEmployeeId?: string
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true },
    });

    if (!project) {
      throw AppError.notFound(`Project not found`);
    }

    if (actorRole === Role.PROJECT_MANAGER) {
      const isLead = project.members.some(
        (m) => m.employeeId === actorEmployeeId && m.isProjectLead
      );
      if (!isLead) {
        throw AppError.forbidden('Only the Project Lead or CEO can remove team members');
      }
    }

    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_employeeId: {
          projectId,
          employeeId: targetEmployeeId,
        },
      },
    });

    if (!member) {
      throw AppError.notFound('Employee is not assigned to this project');
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectMember.delete({
        where: { id: member.id },
      });

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.DELETE,
          entityName: 'ProjectMember',
          entityId: member.id,
          beforeState: member as unknown as Prisma.JsonObject,
        },
      });
    });

    return { message: 'Member successfully removed from project' };
  }
}

export const projectService = new ProjectService();