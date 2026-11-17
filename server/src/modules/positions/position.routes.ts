import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../auth/can';
import { validate } from '../../middleware/validate.middleware';
import { AppError } from '../../errors/AppError';

const nameSchema = z.object({ name: z.string().trim().min(2).max(100) });

const router = Router();
router.use(authenticate);

// Management can list (filters, reports); only the CEO can add or rename.
// Read by anyone who sees people (filters, the employee form) or manages the list.
router.get('/', requirePermission('employees.view', 'settings.positions'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const positions = await prisma.position.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { employees: true } } },
    });
    res.json({ success: true, data: positions });
  } catch (e) {
    next(e);
  }
});

router.post('/', requirePermission('settings.positions'), validate(nameSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const position = await prisma.position.create({ data: { name: req.body.name } });
    res.status(201).json({ success: true, data: position });
  } catch (e) {
    next(e);
  }
});

// Renaming cascades to employees through the foreign key on Employee.position.
router.patch('/:id', requirePermission('settings.positions'), validate(nameSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.position.findUnique({ where: { id: req.params.id } });
    if (!existing) throw AppError.notFound('Position not found');
    const position = await prisma.position.update({ where: { id: existing.id }, data: { name: req.body.name } });
    res.json({ success: true, data: position });
  } catch (e) {
    next(e);
  }
});

export const positionRouter = router;
