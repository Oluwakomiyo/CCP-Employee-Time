import { Router } from 'express';
import { correctionController } from './correction.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../auth/can';
import { validate } from '../../middleware/validate.middleware';
import { createCorrectionSchema, reviewCorrectionSchema, updateCorrectionSchema } from './correction.schema';

const router = Router();

router.use(authenticate);

// 1. List corrections (role-filtered)
router.get('/', correctionController.listCorrections);

// 2. Submit new correction request
router.post('/', requirePermission('corrections.request'), validate(createCorrectionSchema), correctionController.submitCorrection);

// 3. Edit or withdraw own pending request (withdrawal marks it CANCELLED; requests are never hard-deleted)
router.patch('/:id', validate(updateCorrectionSchema), correctionController.updateCorrection);
router.delete('/:id', correctionController.cancelCorrection);

// 4. Review (Approve/Reject) Request - CEO_ADMIN & PROJECT_MANAGER only
router.patch(
  '/:id/review',
  requirePermission('corrections.review'),
  validate(reviewCorrectionSchema),
  correctionController.reviewCorrection
);

export const correctionRouter = router;