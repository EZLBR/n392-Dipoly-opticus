export interface UserResponseDTO {
  id: number;
  name: string;
  email: string;
  role: string;
  factoryName: string | null;
  createdAt?: Date | string | null;
}
