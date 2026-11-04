import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
// Fallback 32-byte secret key if not in .env
const SECRET_KEY = Buffer.from(
  (process.env.ENCRYPTION_SECRET || 'ccp_super_secret_32_bytes_vault_key_123456').padEnd(32).slice(0, 32)
);
const IV_LENGTH = 16;

export const encryptPassword = (text: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

export const decryptPassword = (text: string): string => {
  try {
    const [ivHex, encryptedHex] = text.split(':');
    if (!ivHex || !encryptedHex) return text;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '******';
  }
};