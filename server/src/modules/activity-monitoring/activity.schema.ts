import { z } from 'zod';
import { SessionStatus } from '@prisma/client';

export const browserHeartbeatSchema = z.object({
  clientTimestamp: z.string().datetime().optional(),
  idleSeconds: z.number().int().nonnegative().default(0),
});

export const agentHeartbeatSchema = z.object({
  deviceIdentifier: z.string().min(1, 'Device identifier is required'),
  clientTimestamp: z.string().datetime().optional(),
  sessionStatus: z.nativeEnum(SessionStatus).default(SessionStatus.ACTIVE),
  idleSeconds: z.number().int().nonnegative().default(0),
});

export const registerDeviceSchema = z.object({
  employeeId: z.string().uuid('Valid employee UUID required'),
  deviceName: z.string().min(2, 'Device name required').trim(),
  deviceIdentifier: z.string().min(4, 'Hardware identifier or MAC required').trim(),
  platform: z.string().min(2, 'Platform required (e.g., Windows 11, macOS)').trim(),
});

export type BrowserHeartbeatInput = z.infer<typeof browserHeartbeatSchema>;
export type AgentHeartbeatInput = z.infer<typeof agentHeartbeatSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;