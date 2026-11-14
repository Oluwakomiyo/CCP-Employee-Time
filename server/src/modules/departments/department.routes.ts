import { Router, Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { AppError } from '../../errors/AppError';

const nameSchema = z.object({ name: z.string().trim().min(2).max(100) });

const router = Router();
router.use(authenticate);

// Management can list (filters, reports); only the CEO can add or rename.
router.get('/', authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { employees: true } } },
    });
    res.json({ success: true, data: departments });
  } catch (e) {
    next(e);
  }
});

router.post('/', authorize(Role.CEO_ADMIN), validate(nameSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const department = await prisma.department.create({ data: { name: req.body.name } });
    res.status(201).json({ success: true, data: department });
  } catch (e) {
    next(e);
  }
});

// Renaming cascades to employees through the foreign key on Employee.department.
router.patch('/:id', authorize(Role.CEO_ADMIN), validate(nameSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
    if (!existing) throw AppError.notFound('Department not found');
    const department = await prisma.department.update({ where: { id: existing.id }, data: { name: req.body.name } });
    res.json({ success: true, data: department });
  } catch (e) {
    next(e);
  }
});

export const departmentRouter = router;
