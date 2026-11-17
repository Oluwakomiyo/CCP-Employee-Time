import type { Grants } from "./permissions";
/** Shapes returned by the Express API (only the fields the UI reads). */


export interface Me {
  id: string;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  /** The role this person has (system preset or custom) and its permissions, from /auth/me. */
  roleInfo?: { id: string; key: string; name: string };
  permissions?: Grants;
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

