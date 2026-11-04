import { Request, Response, NextFunction } from 'express';
import { projectService } from './project.service';
import { queryProjectsSchema } from './project.schema';

export class ProjectController {
  listProjects = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = queryProjectsSchema.parse(req.query);
      const result = await projectService.listProjects(
        query,
        req.user!.role,
        req.user!.employeeId
      );

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  getProjectById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const project = await projectService.getProjectById(
        id,
        req.user!.role,
        req.user!.employeeId
      );

      res.status(200).json({
        status: 'success',
        data: { project },
      });
    } catch (error) {
      next(error);
    }
  };

  createProject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const project = await projectService.createProject(
        req.body,
        req.user!.userId,
        req.user!.employeeId
      );

      res.status(201).json({
        status: 'success',
        message: 'Project created successfully',
        data: { project },
      });
    } catch (error) {
      next(error);
    }
  };

  updateProject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const project = await projectService.updateProject(
        id,
        req.body,
        req.user!.userId,
        req.user!.role,
        req.user!.employeeId
      );

      res.status(200).json({
        status: 'success',
        message: 'Project updated successfully',
        data: { project },
      });
    } catch (error) {
      next(error);
    }
  };

  deleteProject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await projectService.deleteProject(req.params.id, req.user!.userId);
      res.status(200).json({ 
        status: 'success', 
        message: result.message });
    } catch (error) { next(error); }
  };

  getCostBreakdown = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await projectService.getProjectCostBreakdown(req.params.id, req.user!.role);
      res.status(200).json({ 
        status: 'success', 
        data: result });
    } catch (error) { next(error); }
  };

  assignMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const membership = await projectService.assignMember(
        id,
        req.body,
        req.user!.userId,
        req.user!.role,
        req.user!.employeeId
      );

      res.status(201).json({
        status: 'success',
        message: 'Member successfully assigned to project',
        data: { membership },
      });
    } catch (error) {
      next(error);
    }
  };

  removeMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, employeeId } = req.params;
      const result = await projectService.removeMember(
        id,
        employeeId,
        req.user!.userId,
        req.user!.role,
        req.user!.employeeId
      );

      res.status(200).json({
        status: 'success',
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const projectController = new ProjectController();