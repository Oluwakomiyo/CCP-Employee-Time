import crypto from 'crypto';
import {
  HeartbeatSource,
  SessionStatus,
  VerificationStatus,
  SegmentStatus,
  LocationType,
  Role,
  AuditAction,
  DeviceEnrollment,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { workDateFor } from '../../utils/time';
import {
  BrowserHeartbeatInput,
  AgentHeartbeatInput,
  RegisterDeviceInput,
  EnrollDeviceInput,
} from './activity.schema';
import { WorkEvidenceSummary } from './activity.types';

const hashKey = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

/** A new device key: the raw value goes to the device once, only its SHA-256 is stored. */
const newDeviceKey = () => {
  const rawApiKey = `dev_${crypto.randomBytes(24).toString('hex')}`;
  return { rawApiKey, apiKeyHash: hashKey(rawApiKey) };
};

export class ActivityService {
  /**
   * Browser Heartbeat:
   * Called by the web app every 60s while the authenticated session is open.
   */
  async recordBrowserHeartbeat(employeeId: string, input: BrowserHeartbeatInput) {
    const now = new Date();
    const todayDate = workDateFor(now);

    // 🔴 Link directly to the employee's currently active shift segment
    const activeSegment = await prisma.workSegment.findFirst({
      where: {
        workDay: { employeeId },
        status: SegmentStatus.ACTIVE,
      },
      select: { workDayId: true },
    });

    const todayWorkDay = activeSegment ? null : await prisma.workDay.findUnique({
      where: { employeeId_date: { employeeId, date: todayDate } },
      select: { id: true },
    });

    const targetWorkDayId = activeSegment?.workDayId || todayWorkDay?.id || null;

    const heartbeat = await prisma.activityHeartbeat.create({
      data: {
        employeeId,
        workDayId: targetWorkDayId,
        source: HeartbeatSource.BROWSER,
        receivedAt: now,
        clientTimestamp: input.clientTimestamp ? new Date(input.clientTimestamp) : null,
        sessionStatus: input.idleSeconds > 300 ? SessionStatus.IDLE : SessionStatus.ACTIVE,
        idleSeconds: input.idleSeconds,
      },
    });

    return { received: true, id: heartbeat.id, timestamp: now.toISOString() };
  }

  /**
   * Device Agent Heartbeat:
   * Called by installed company desktop agent with device credentials.
   */
  async recordAgentHeartbeat(apiKey: string, input: AgentHeartbeatInput) {
    const hashedKey = hashKey(apiKey);

    const device = await prisma.employeeDevice.findUnique({
      where: { deviceIdentifier: input.deviceIdentifier },
    });

    // Constant-time compare, so response timing never hints at a correct key prefix.
    const matches = !!device && crypto.timingSafeEqual(Buffer.from(device.apiKeyHash, 'hex'), Buffer.from(hashedKey, 'hex'));
    if (!device || !device.isActive || !matches) {
      throw AppError.forbidden('Invalid device credentials or device inactive');
    }

    const now = new Date();
    const todayDate = workDateFor(now);

    const activeSegment = await prisma.workSegment.findFirst({
      where: {
        workDay: { employeeId: device.employeeId },
        status: SegmentStatus.ACTIVE,
      },
      select: { workDayId: true },
    });

    const todayWorkDay = activeSegment
      ? null
      : await prisma.workDay.findUnique({
        where: { employeeId_date: { employeeId: device.employeeId, date: todayDate } },
        select: { id: true },
      });

    const targetWorkDayId = activeSegment?.workDayId || todayWorkDay?.id || null;

    const [heartbeat] = await prisma.$transaction([
      prisma.activityHeartbeat.create({
        data: {
          employeeId: device.employeeId,
          workDayId: targetWorkDayId,
          deviceId: device.id,
          source: HeartbeatSource.DESKTOP_AGENT,
          receivedAt: now,
          clientTimestamp: input.clientTimestamp ? new Date(input.clientTimestamp) : null,
          sessionStatus: input.sessionStatus,
          idleSeconds: input.idleSeconds,
        },
      }),
      prisma.employeeDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: now },
      }),
    ]);

    return { received: true, id: heartbeat.id, timestamp: now.toISOString() };
  }

  /**
   * Register a new company device (CEO_ADMIN / PM only).
   * Generates a revocable device API key.
   */
  async registerDevice(input: RegisterDeviceInput, actorUserId: string) {
    const { rawApiKey, apiKeyHash } = newDeviceKey();

    const device = await prisma.$transaction(async (tx) => {
      const created = await tx.employeeDevice.create({
        data: {
          employeeId: input.employeeId,
          deviceName: input.deviceName,
          deviceIdentifier: input.deviceIdentifier,
          platform: input.platform,
          apiKeyHash,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          action: AuditAction.CREATE,
          entityName: 'EmployeeDevice',
          entityId: created.id,
          afterState: { event: 'DEVICE_REGISTERED', deviceIdentifier: created.deviceIdentifier, employeeId: created.employeeId },
        },
      });
      return created;
    });

    return {
      device: {
        id: device.id,
        deviceName: device.deviceName,
        deviceIdentifier: device.deviceIdentifier,
        platform: device.platform,
      },
      apiKey: rawApiKey, // Return plaintext ONCE upon creation for agent configuration
    };
  }

  /**
   * The desktop app enrolling the computer it runs on, for the signed-in person.
   * New computer: created as theirs. Theirs already: a fresh key (reinstall or lost key).
   * Turned off by an admin, or someone else's: refused, an admin decides.
   */
  async enrollDevice(employeeId: string, userId: string, input: EnrollDeviceInput) {
    const { rawApiKey, apiKeyHash } = newDeviceKey();
    return prisma.$transaction(async (tx) => {
      const existing = await tx.employeeDevice.findUnique({ where: { deviceIdentifier: input.deviceIdentifier } });
      if (existing && existing.employeeId !== employeeId) {
        throw AppError.conflict('This computer is registered to another person. Ask an admin to revoke it first.', 'DEVICE_OWNED');
      }
      if (existing && !existing.isActive) {
        throw new AppError('This computer was turned off by an admin. Ask them to reinstate it.', 403, undefined, 'DEVICE_REVOKED');
      }
      const device = existing
        ? await tx.employeeDevice.update({
            where: { id: existing.id },
            data: { apiKeyHash, deviceName: input.deviceName, platform: input.platform },
          })
        : await tx.employeeDevice.create({
            data: { employeeId, deviceIdentifier: input.deviceIdentifier, deviceName: input.deviceName, platform: input.platform, apiKeyHash, enrolledBy: DeviceEnrollment.SELF },
          });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
          entityName: 'EmployeeDevice',
          entityId: device.id,
          afterState: { event: existing ? 'DEVICE_KEY_REISSUED' : 'DEVICE_ENROLLED', deviceName: device.deviceName, platform: device.platform },
        },
      });
      return {
        device: { id: device.id, deviceName: device.deviceName, deviceIdentifier: device.deviceIdentifier, platform: device.platform },
        apiKey: rawApiKey, // shown once; the app stores it encrypted
      };
    });
  }

  /**
   * Neutral Work Evidence Reconstruction:
   * Reconstructs the day's record by contrasting Official Time vs. Activity Telemetry.
   */
  async getWorkEvidenceSummary(workDayId: string): Promise<WorkEvidenceSummary> {
    const workDay = await prisma.workDay.findUnique({
      where: { id: workDayId },
      include: {
        employee: true,
        segments: {
          include: {
            project: true,
            activities: true,
            breaks: true,
          },
        },
        heartbeats: {
          orderBy: { receivedAt: 'asc' },
          include: { device: true },
        },
      },
    });

    if (!workDay) {
      throw AppError.notFound(`WorkDay '${workDayId}' not found`);
    }

    // 1. Calculate Official Time
    const segments = workDay.segments;
    const firstClockIn = segments.length > 0 ? segments[0].clockIn : null;
    const lastClockOut =
      segments.length > 0 ? segments[segments.length - 1].clockOut : null;

    // 🔴 Calculate live elapsed seconds if the segment is still active (clockOut is null)
    const nowMs = Date.now();
    const grossClockedSeconds = segments.reduce((sum, s) => {
      if (s.durationSeconds !== null && s.durationSeconds !== undefined) {
        return sum + s.durationSeconds;
      }
      // Segment is currently ongoing: calculate live elapsed time
      const liveElapsed = Math.max(0, Math.floor((nowMs - new Date(s.clockIn).getTime()) / 1000));
      return sum + liveElapsed;
    }, 0);
    const recordedBreakSeconds = workDay.totalBreakSeconds;
    const netClockedSeconds = Math.max(0, grossClockedSeconds - recordedBreakSeconds);

    const locations = Array.from(new Set(segments.map((s) => s.location)));

    // 2. Calculate Activity Telemetry (Heartbeats)
    // De-duplicate: one signal per device per minute, so retries and
    // double-sends never inflate activity. Prefer the desktop agent when it
    // reported that day; browser signals are the fallback.
    const heartbeats = workDay.heartbeats;
    const seen = new Set<string>();
    const unique = heartbeats.filter((h) => {
      const minute = Math.floor(new Date(h.receivedAt).getTime() / 60000);
      const key = `${h.deviceId ?? `browser:${h.employeeId}`}:${minute}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const agentBeats = unique.filter((h) => h.source === HeartbeatSource.DESKTOP_AGENT);
    const measured = agentBeats.length > 0 ? agentBeats : unique;
    const activeHeartbeats = measured.filter(
      (h) => h.sessionStatus === SessionStatus.ACTIVE && h.idleSeconds < 300
    );

    // Each heartbeat represents ~60 seconds of detected device activity
    const detectedActiveSeconds = activeHeartbeats.length * 60;

    // Detect idle periods > 15 minutes (900 seconds)
    const significantIdleHeartbeats = measured.filter((h) => h.idleSeconds >= 900);
    const significantIdleSeconds = significantIdleHeartbeats.length * 60;

    const devicesSeen = Array.from(
      new Set(
        measured.filter((h) => h.device).map((h) => `${h.device!.deviceName} (${h.device!.platform})`)
      )
    );

    const isAgentOnline = measured.some(
      (h) =>
        h.source === HeartbeatSource.DESKTOP_AGENT &&
        Date.now() - new Date(h.receivedAt).getTime() < 5 * 60 * 1000
    );

    // 3. Compile Project Context
    const allActivities = segments.flatMap((s) =>
      s.activities.map((a) => ({
        title: `${s.project.code}: ${a.title}`,
      }))
    );
    const uniqueProjects = new Set(segments.map((s) => s.projectId)).size;

    // 4. Neutral Verification Status Evaluation (Section 95)
    let status: VerificationStatus = VerificationStatus.NORMAL;
    const reviewNotes: string[] = [];

    const isSiteWork = locations.includes(LocationType.SITE);

    if (isSiteWork) {
      status = VerificationStatus.SITE_WORK;
      reviewNotes.push('Workday includes on-site work. Reduced computer activity is expected.');
    } else if (unique.length === 0) {
      status = VerificationStatus.MISSING_DATA;
      reviewNotes.push('No activity telemetry recorded. Device agent may be offline or uninstalled.');
    } else if (netClockedSeconds > 0) {
      // Discrepancy rule: if clocked for > 4 hours and detected activity is under 50%
      const unexplainedGapSeconds = netClockedSeconds - detectedActiveSeconds;
      if (unexplainedGapSeconds > 2 * 3600 && !isSiteWork) {
        status = VerificationStatus.REVIEW;
        reviewNotes.push(
          `Detected computer activity (${Math.round(detectedActiveSeconds / 60)}m) is significantly lower than net clocked hours (${Math.round(netClockedSeconds / 60)}m). Neutral review recommended.`
        );
      }
    }

    return {
      employee: {
        id: workDay.employee.id,
        employeeCode: workDay.employee.employeeCode,
        name: `${workDay.employee.firstName} ${workDay.employee.lastName}`,
        department: workDay.employee.department,
      },
      workDayId: workDay.id,
      date: workDay.date.toISOString().split('T')[0],
      officialTime: {
        clockedIn: firstClockIn ? firstClockIn.toISOString() : null,
        clockedOut: lastClockOut ? lastClockOut.toISOString() : null,
        grossClockedSeconds,
        recordedBreakSeconds,
        netClockedSeconds,
        locations,
      },
      activityEvidence: {
        heartbeatCount: unique.length,
        detectedActiveSeconds,
        significantIdleSeconds,
        registeredDevicesSeen: devicesSeen,
        isDeviceAgentOnline: isAgentOnline,
      },
      context: {
        projectCount: uniqueProjects,
        activityCount: allActivities.length,
        activities: allActivities,
      },
      verification: {
        status,
        reviewNotes,
      },
    };
  }
}

export const activityService = new ActivityService();