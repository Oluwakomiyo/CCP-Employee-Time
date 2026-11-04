import { Router } from 'express';
import { Role } from '@prisma/client';
import { correctionController } from './correction.controller';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createCorrectionSchema, reviewCorrectionSchema, updateCorrectionSchema } from './correction.schema';

const router = Router();

router.use(authenticate);

// 1. List corrections (role-filtered)
router.get('/', correctionController.listCorrections);

// 2. Submit new correction request
router.post('/', validate(createCorrectionSchema), correctionController.submitCorrection);

// 3. Cancel own pending request
router.patch('/:id', validate(updateCorrectionSchema), correctionController.updateCorrection);
router.delete('/:id', correctionController.deleteCorrection);

// 4. Review (Approve/Reject) Request - CEO_ADMIN & PROJECT_MANAGER only
router.patch(
  '/:id/review',
  authorize(Role.CEO_ADMIN, Role.PROJECT_MANAGER),
  validate(reviewCorrectionSchema),
  correctionController.reviewCorrection
);

export const correctionRouter = router;