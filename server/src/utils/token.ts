import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { requiredEnv } from '../config/env';

/** Identity only: what a person may do comes from their role's permissions, read per request. */
export interface TokenPayload {
  userId: string;
  employeeId: string;
}

const accessExpiry = () => (process.env.JWT_EXPIRES_IN || '15m') as SignOptions['expiresIn'];
const refreshExpiry = () => (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

const sign = (payload: TokenPayload, secret: string, expiresIn: SignOptions['expiresIn']) =>
  jwt.sign({ userId: payload.userId, employeeId: payload.employeeId }, secret, {
    expiresIn,
    algorithm: 'HS256',
  });

export const generateAccessToken = (payload: TokenPayload): string =>
  sign(payload, requiredEnv('JWT_SECRET'), accessExpiry());

export const generateRefreshToken = (payload: TokenPayload): string =>
  sign(payload, requiredEnv('JWT_REFRESH_SECRET'), refreshExpiry());

export const verifyAccessToken = (token: string): TokenPayload =>
  jwt.verify(token, requiredEnv('JWT_SECRET'), { algorithms: ['HS256'] }) as TokenPayload;

export const verifyRefreshToken = (token: string): TokenPayload =>
  jwt.verify(token, requiredEnv('JWT_REFRESH_SECRET'), { algorithms: ['HS256'] }) as TokenPayload;

// Hashes refresh tokens with SHA-256 before persisting to PostgreSQL
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');
