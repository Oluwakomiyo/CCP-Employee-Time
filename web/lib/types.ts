/** Shapes returned by the Express API (only the fields the UI reads). */

export type Role = "CEO_ADMIN" | "PROJECT_MANAGER" | "EMPLOYEE";

export interface Me {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department: string;
    position: string;
    status: string;
    hireDate: string;
  } | null;
}

export const isManagement = (role?: Role) => role === "CEO_ADMIN" || role === "PROJECT_MANAGER";
export const isCeo = (role?: Role) => role === "CEO_ADMIN";
