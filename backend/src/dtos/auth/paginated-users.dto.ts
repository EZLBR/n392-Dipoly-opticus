import type { UserResponseDTO } from "./user-response.dto.js";

export interface PaginatedUsersDTO {
  users: UserResponseDTO[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}
