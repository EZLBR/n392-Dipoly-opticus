export interface UserResponseDTO {
  /** ID-02: identificador público (UUID). O id inteiro não sai da API. */
  publicId: string;
  name: string;
  email: string;
  role: string;
  factoryName: string | null;
  createdAt?: Date | string | null;
}
