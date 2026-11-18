/** Staff roles and the dashboard areas each may open. Mirrors role_can() in 0002_security.sql. */

export const ROLES = ["owner", "manager", "inventory", "support"] as const;
export type Role = (typeof ROLES)[number];

export const AREAS = [
  "dashboard",
  "tasks",
  "hours",
  "products",
  "inventory",
  "orders",
  "customers",
  "messages",
  "purchasing",
  "finance",
  "reports",
  "settings",
  "team",
] as const;
export type Area = (typeof AREAS)[number];

const MATRIX: Record<Role, readonly Area[]> = {
  owner: AREAS,
  manager: ["dashboard", "tasks", "hours", "products", "inventory", "orders", "customers", "messages", "purchasing", "finance", "reports", "settings"],
  inventory: ["dashboard", "tasks", "hours", "products", "inventory", "orders"],
  support: ["dashboard", "tasks", "hours", "orders", "customers", "messages"],
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  inventory: "Inventory",
  support: "Customer service",
};

export function roleCan(role: Role | null | undefined, area: Area): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(area) ?? false;
}

export function areasFor(role: Role): readonly Area[] {
  return MATRIX[role];
}

/** Owner and manager run the business; they see everyone's tasks and hours. */
export function isLead(role: Role | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
