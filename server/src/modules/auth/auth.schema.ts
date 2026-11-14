import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('A valid email address is required').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required').max(200),
});

// Browser clients send the refresh token as an httpOnly cookie; Electron/agents may send it in the body.
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const passwordRule = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordRule,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
