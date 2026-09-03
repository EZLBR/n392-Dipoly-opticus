import type { Role } from "@prisma/client";

export interface UpdateUserDTO {
  name?: string;
  email?: string;
  password?: string;
  role?: Role;
  factoryName?: string | null;
}
