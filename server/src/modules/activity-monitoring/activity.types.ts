import { VerificationStatus, SessionStatus, LocationType } from '@prisma/client';

export interface WorkEvidenceSummary {
  employee: {
    id: string;
    employeeCode: string;
    name: string;
    department: string;
  };
  workDayId: string;
  date: string;
  // Official attendance records (Question 1)
  officialTime: {
    clockedIn: string | null;
    clockedOut: string | null;
    grossClockedSeconds: number;
    recordedBreakSeconds: number;
    netClockedSeconds: number;
    locations: LocationType[];
  };
  // Measured technical signals (Question 2)
  activityEvidence: {
    heartbeatCount: number;
    detectedActiveSeconds: number;
    significantIdleSeconds: number;
    registeredDevicesSeen: string[];
    isDeviceAgentOnline: boolean;
  };
  // Project context
  context: {
    projectCount: number;
    activityCount: number;
    activities: { title: string; durationMinutes?: number }[];
  };
  // Neutral evaluation
  verification: {
    status: VerificationStatus;
    reviewNotes: string[];
  };
}