import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { Role } from '@prisma/client';

export interface TokenPayload {
userId: string;
role: Role;
employeeId: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
const JWT_EXPIRES_IN: SignOptions['expiresIn'] =
(process.env.JWT_EXPIRES_IN || '15m') as SignOptions['expiresIn'];

const JWT_REFRESH_SECRET =
process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret';
const JWT_REFRESH_EXPIRES_IN: SignOptions['expiresIn'] =
(process.env.JWT_REFRESH_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

export const generateAccessToken = (payload: TokenPayload): string => {
return jwt.sign(payload, JWT_SECRET, {
expiresIn: JWT_EXPIRES_IN,
});
};

export const generateRefreshToken = (payload: TokenPayload): string => {
return jwt.sign(payload, JWT_REFRESH_SECRET, {
expiresIn: JWT_REFRESH_EXPIRES_IN,
});
};

export const verifyAccessToken = (token: string): TokenPayload => {
return jwt.verify(token, JWT_SECRET) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
};

// Hashes refresh tokens with SHA-256 before persisting to PostgreSQL
export const hashToken = (token: string): string => {
return crypto.createHash('sha256').update(token).digest('hex');
};