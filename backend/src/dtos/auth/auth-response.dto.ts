import type { UserResponseDTO } from "./user-response.dto.js";

export interface AuthResponseDTO {
  user: UserResponseDTO;
  token: string;
}
