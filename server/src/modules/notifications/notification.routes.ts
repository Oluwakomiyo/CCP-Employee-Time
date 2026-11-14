import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { notificationService } from './notification.service';

const listQuery = z.object({
  unread: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const idParam = z.object({ id: z.string().uuid() });

/** Mounted at /api/v1/me/notifications. Every query is scoped to the signed-in user. */
const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = listQuery.parse(req.query);
    const { items, unread } = await notificationService.list(req.user!.userId, { unreadOnly: q.unread === 'true', limit: q.limit });
    res.json({ success: true, data: items, meta: { unread } });
  } catch (e) {
    next(e);
  }
});

router.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await notificationService.markAllRead(req.user!.userId) });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParam.parse(req.params);
    await notificationService.markRead(req.user!.userId, id);
    res.json({ success: true, data: { id } });
  } catch (e) {
    next(e);
  }
});

export default router;
