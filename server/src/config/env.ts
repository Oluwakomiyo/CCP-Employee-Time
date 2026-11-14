/** Reads a required environment variable at call time; throws if missing so misconfiguration fails loudly. */
export const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

/** Called once at boot so the server refuses to start without its secrets. */
export const assertRequiredEnv = () => {
  ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ALLOWED_ORIGINS'].forEach(requiredEnv);
};
