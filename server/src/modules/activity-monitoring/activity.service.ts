import crypto from 'crypto';
import {
  HeartbeatSource,
  SessionStatus,
  VerificationStatus,
  SegmentStatus,
  LocationType,
  Role,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import {
  BrowserHeartbeatInput,
  AgentHeartbeatInput,
  RegisterDeviceInput,
} from './activity.schema';
import { WorkEvidenceSummary } from './activity.types';

export class ActivityService {
  /**
   * Browser Heartbeat:
   * Called by the web app every 60s while the authenticated session is open.
   */
  async recordBrowserHeartbeat(employeeId: string, input: BrowserHeartbeatInput) {
    const now = new Date();
    const todayDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Link to today's active WorkDay if one exists
    const workDay = await prisma.workDay.findUnique({
      where: { employeeId_date: { employeeId, date: todayDate } },
    });

    const heartbeat = await prisma.activityHeartbeat.create({
      data: {
        employeeId,
        workDayId: workDay?.id || null,
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
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    const device = await prisma.employeeDevice.findUnique({
      where: { deviceIdentifier: input.deviceIdentifier },
    });

    if (!device || !device.isActive || device.apiKeyHash !== hashedKey) {
      throw AppError.forbidden('Invalid device credentials or device inactive');
    }

    const now = new Date();
    const todayDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const workDay = await prisma.workDay.findUnique({
      where: { employeeId_date: { employeeId: device.employeeId, date: todayDate } },
    });

    // Record heartbeat and update device's lastSeenAt
    const [heartbeat] = await prisma.$transaction([
      prisma.activityHeartbeat.create({
        data: {
          employeeId: device.employeeId,
          workDayId: workDay?.id || null,
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
  async registerDevice(input: RegisterDeviceInput) {
    const rawApiKey = `dev_${crypto.randomBytes(24).toString('hex')}`;
    const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

    const device = await prisma.employeeDevice.create({
      data: {
        employeeId: input.employeeId,
        deviceName: input.deviceName,
        deviceIdentifier: input.deviceIdentifier,
        platform: input.platform,
        apiKeyHash,
      },
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
    const heartbeats = workDay.heartbeats;
    const activeHeartbeats = heartbeats.filter(
      (h) => h.sessionStatus === SessionStatus.ACTIVE && h.idleSeconds < 300
    );

    // Each heartbeat represents ~60 seconds of detected device activity
    const detectedActiveSeconds = activeHeartbeats.length * 60;

    // Detect idle periods > 15 minutes (900 seconds)
    const significantIdleHeartbeats = heartbeats.filter((h) => h.idleSeconds >= 900);
    const significantIdleSeconds = significantIdleHeartbeats.length * 60;

    const devicesSeen = Array.from(
      new Set(
        heartbeats.filter((h) => h.device).map((h) => `${h.device!.deviceName} (${h.device!.platform})`)
      )
    );

    const isAgentOnline = heartbeats.some(
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
    } else if (heartbeats.length === 0) {
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
        heartbeatCount: heartbeats.length,
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