import { notify } from '../notifications/notification.service';
import { Prisma, PermissionScope, AuditAction, ProjectStatus, NotificationType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { reportService } from '../reports/report.service';
import { AuthUser, can, scopeOf } from '../../auth/can';
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
    user: AuthUser,
    userEmployeeId?: string
  ) {
    const { page, limit, search, isActive, status, sort, order, mine } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProjectWhereInput = {};

    if (status) {
      where.status = status;
    } else if (isActive !== undefined) {
      where.status = isActive ? ProjectStatus.ACTIVE : { not: ProjectStatus.ACTIVE };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Without projects.view ALL, only projects the user is on (OWN and TEAM both mean "mine").
    if (scopeOf(user, 'projects.view') !== PermissionScope.ALL || mine) {
      if (!userEmployeeId) {
        return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
      }
      where.members = {
        some: {
          employeeId: userEmployeeId,
          removedAt: null,
        },
      };
    }

    const [total, items] = await prisma.$transaction([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        include: {
          _count: {
            select: {
              members: { where: { removedAt: null } },
              workSegments: true,
            },
          },
          members: {
            where: { removedAt: null },
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

    // Hours against each estimate need reports.view; otherwise only your own hours are shown elsewhere.
    const worked = can(user, 'reports.view') ? await reportService.hoursForProjects(items.map((p) => p.id)) : null;

    return {
      data: worked ? items.map((p) => ({ ...p, hoursWorked: worked.get(p.id) ?? 0 })) : items,
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
  async getProjectById(projectId: string, user: AuthUser, userEmployeeId?: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          where: { removedAt: null },
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

    // Without projects.view ALL you only see projects you are assigned to.
    if (scopeOf(user, 'projects.view') !== PermissionScope.ALL) {
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
  async createProject(input: CreateProjectInput, actorUserId: string, actorEmployeeId: string | undefined, actor: AuthUser) {
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
          clientName: input.clientName,
          location: input.location,
          estimatedHours: input.estimatedHours,
          status: input.status,
          startDate: new Date(input.startDate),
          endDate: input.endDate ? new Date(input.endDate) : null,
          createdById: actorUserId,
        },
      });

      // Someone who manages only projects they lead becomes the lead of a project they create,
      // or they could not edit it afterwards.
      if (actorEmployeeId) {
        if (scopeOf(actor, 'projects.manage') === PermissionScope.TEAM) {
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
    actor: AuthUser,
    actorEmployeeId?: string
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { where: { removedAt: null } } },
    });

    if (!project) {
      throw AppError.notFound(`Project with ID '${projectId}' not found`);
    }

    // projects.manage TEAM: only projects they lead.
    if (scopeOf(actor, 'projects.manage') !== PermissionScope.ALL) {
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
          clientName: input.clientName,
          location: input.location,
          estimatedHours: input.estimatedHours,
          status: input.status,
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
   * Deletes a project only if no time was ever recorded against it (e.g. created by mistake).
   * Projects with history are kept: change their status to COMPLETED or CANCELLED instead.
   */
  async deleteProject(projectId: string, actorUserId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw AppError.notFound('Project not found');

    const hasTime = await prisma.workSegment.count({ where: { projectId } });
    if (hasTime > 0) {
      throw AppError.conflict(
        'This project has recorded time and cannot be deleted. Set its status to Completed or Cancelled instead.',
        'PROJECT_HAS_HISTORY'
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({ where: { projectId } });
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
   * shortcut: legacy shape for the old client's "Cost & Time" modal, now derived from the
   * project report (net of breaks, rate in force per day). Remove with client/ in Phase 7.
   */
  async getProjectCostBreakdown(projectId: string, user: AuthUser) {
    const r = await reportService.projectReport(user, projectId, {});
    const isCeo = can(user, 'compensation.view');
    return {
      projectId: r.project.id,
      projectName: r.project.name,
      projectCode: r.project.code,
      totalHours: r.totalHours,
      totalProjectCost: isCeo ? r.labourCost ?? 0 : null,
      employeeBreakdown: r.hoursByEmployee.map((e) => ({
        employeeId: e.employeeId,
        employeeCode: e.employeeCode,
        name: e.name,
        totalHours: e.hours,
        cost: isCeo ? (e as { labourCost?: number }).labourCost ?? 0 : null,
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
    actor: AuthUser,
    actorEmployeeId?: string
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { where: { removedAt: null } } },
    });

    if (!project) {
      throw AppError.notFound(`Project not found`);
    }

    // projects.manage TEAM: only projects they lead.
    if (scopeOf(actor, 'projects.manage') !== PermissionScope.ALL) {
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

    // Appointing a lead needs projects.appointLead; a lead manages ordinary members.
    if (input.isProjectLead && !can(actor, 'projects.appointLead')) {
      throw AppError.forbidden('Only the CEO can appoint a project lead');
    }

    // Check if a current membership already exists (past memberships are kept as history)
    const existingMember = await prisma.projectMember.findFirst({
      where: { projectId, employeeId: input.employeeId, removedAt: null },
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
      await notify(tx, [employee.userId], {
        type: NotificationType.PROJECT_ASSIGNED,
        title: `You were added to ${project.code} ${project.name}`,
        data: { projectId },
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
    actor: AuthUser,
    actorEmployeeId?: string
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { where: { removedAt: null } } },
    });

    if (!project) {
      throw AppError.notFound(`Project not found`);
    }

    if (scopeOf(actor, 'projects.manage') !== PermissionScope.ALL) {
      const isLead = project.members.some(
        (m) => m.employeeId === actorEmployeeId && m.isProjectLead
      );
      if (!isLead) {
        throw AppError.forbidden('Only the Project Lead or CEO can remove team members');
      }
    }

    const member = await prisma.projectMember.findFirst({
      where: { projectId, employeeId: targetEmployeeId, removedAt: null },
    });

    if (!member) {
      throw AppError.notFound('Employee is not assigned to this project');
    }
    if (member.isProjectLead && !can(actor, 'projects.appointLead')) {
      throw AppError.forbidden('Only the CEO can remove a project lead');
    }

    // Soft removal: history of who was on the project is preserved (spec §22).
    const removedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.projectMember.update({ where: { id: member.id }, data: { removedAt } });

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.UPDATE,
          entityName: 'ProjectMember',
          entityId: member.id,
          beforeState: member as unknown as Prisma.JsonObject,
          afterState: { event: 'EMPLOYEE_REMOVED_FROM_PROJECT', removedAt: removedAt.toISOString() },
        },
      });
    });

    return { message: 'Member successfully removed from project' };
  }
}

export const projectService = new ProjectService();