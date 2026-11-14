import { Router } from 'express';
import { Role } from '@prisma/client';
import { projectController } from './project.controller';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createProjectSchema,
  updateProjectSchema,
  assignMemberSchema,
} from './project.schema';

const router = Router();

router.use(authenticate);

// 1. List Projects (Employees see assigned only; PM & CEO see company projects)
router.get('/', projectController.listProjects);

// 2. View Project Details (with members)
router.get('/:id', projectController.getProjectById);

// 3. Create Project (CEO_ADMIN and PROJECT_MANAGER)
router.post(
  '/',
  authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER),
  validate(createProjectSchema),
  projectController.createProject
);

// 4. Update Project (CEO_ADMIN or assigned PM Lead)
router.patch(
  '/:id',
  authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER),
  validate(updateProjectSchema),
  projectController.updateProject
);

// 5. Delete Project (CEO_ADMIN only)
router.delete('/:id', 
  authorize(Role.CEO_ADMIN), 
  projectController.deleteProject
);

// 6. Project hours/cost breakdown: management only. PMs only for projects they lead (checked in controller);
// labour cost is further restricted to CEO_ADMIN in the service.
router.get('/:id/cost-breakdown',
  authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER),
  projectController.getCostBreakdown
);

// 7. Team Membership Management
router.post(
  '/:id/members',
  authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER),
  validate(assignMemberSchema),
  projectController.assignMember
);

// 8. Remove Member from Project (CEO_ADMIN or assigned PM Lead)
router.delete(
  '/:id/members/:employeeId',
  authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER),
  projectController.removeMember
);

export const projectRouter = router;