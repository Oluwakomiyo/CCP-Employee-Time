import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requirePermission } from '../../auth/can';
import { roleService } from './role.service';

const permissions = z.record(z.union([z.literal(true), z.enum(['OWN', 'TEAM', 'ALL'])]));
const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional(),
  copyFrom: z.string().uuid().optional(),
  permissions: permissions.optional(),
});
const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: permissions.optional(),
});
const assignSchema = z.object({ roleId: z.string().uuid() });

const send =
  (fn: (req: Request) => Promise<unknown> | unknown, status = 200) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(status).json({ success: true, data: await fn(req) });
    } catch (e) {
      next(e);
    }
  };

const router = Router();
router.use(authenticate);

// The list is also read by whoever adds people (the role picker); everything else is roles.manage.
router.get('/', requirePermission('roles.manage', 'employees.manage'), send(() => roleService.list()));
router.get('/catalog', requirePermission('roles.manage'), send(() => roleService.catalog()));
router.post('/', requirePermission('roles.manage'), validate(createSchema), send((req) => roleService.create(req.user!, req.body), 201));
router.patch('/:id', requirePermission('roles.manage'), validate(updateSchema), send((req) => roleService.update(req.user!, req.params.id, req.body)));
router.post('/:id/reset', requirePermission('roles.manage'), send((req) => roleService.reset(req.user!, req.params.id)));
router.delete('/:id', requirePermission('roles.manage'), send((req) => roleService.remove(req.user!, req.params.id)));
// Moving someone to another role: employees.manage, and only to a role within the actor's own access unless they hold roles.manage.
router.put('/assign/:employeeId', requirePermission('employees.manage'), validate(assignSchema), send((req) => roleService.assign(req.user!, req.params.employeeId, req.body.roleId)));

export const roleRouter = router;
