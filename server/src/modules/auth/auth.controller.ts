import { Request, Response, NextFunction, CookieOptions } from 'express';
import { authService } from './auth.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../middleware/auth.middleware';

const baseCookie = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  domain: process.env.COOKIE_DOMAIN || undefined,
});

const setSessionCookies = (res: Response, tokens: { accessToken: string; refreshToken: string }) => {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...baseCookie(), path: '/', maxAge: 15 * 60 * 1000 });
  // Path '/' so the web app's proxy can tell "session may be refreshable" from "signed out"
  // on page requests. It stays httpOnly + SameSite=Lax; only /auth/refresh ever reads it.
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookie(),
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const clearSessionCookies = (res: Response) => {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: '/' });
  // shortcut: also clear the old path from sessions issued before this change; remove later.
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: '/api/v1/auth' });
};

export class AuthController {
  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body, req.ip, req.headers['user-agent']);
      setSessionCookies(res, result);
      // shortcut: tokens are also returned in the body for the legacy Vite client, Electron and agents.
      // Drop them from the body once the old client is deleted (plan Phase 7).
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.body?.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
      const result = await authService.refreshTokens(token);
      setSessionCookies(res, result);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      clearSessionCookies(res);
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.logout(req.user!.userId, req.ip, req.headers['user-agent']);
      clearSessionCookies(res);
      res.status(200).json({ success: true, data: { message: 'Successfully logged out' } });
    } catch (error) {
      next(error);
    }
  };

  getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getCurrentUser(req.user!.userId);
      res.status(200).json({ success: true, data: { user } });
    } catch (error) {
      next(error);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const result = await authService.changePassword(
        req.user!.userId,
        currentPassword,
        newPassword,
        req.ip,
        req.headers['user-agent']
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();
