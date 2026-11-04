import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { loginSchema, refreshTokenSchema, changePasswordSchema } from './auth.schema';

const router = Router();

// Public routes
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshTokenSchema), authController.refreshToken);

router.post('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);

// Protected routes (Requires valid Bearer token)
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);

export const authRouter = router;