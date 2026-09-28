import { z } from "zod";
import type { UserResponseDTO } from "./user-response.dto.js";

export const getUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type GetUsersQueryDTO = z.infer<typeof getUsersQuerySchema>;

export interface PaginatedUsersDTO {
  users: UserResponseDTO[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}
