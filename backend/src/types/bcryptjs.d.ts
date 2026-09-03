declare module "bcryptjs" {
  interface Bcrypt {
    hash(value: string, salt: string | number): Promise<string>;
    compare(value: string, encrypted: string): Promise<boolean>;
  }

  const bcrypt: Bcrypt;
  export default bcrypt;
}
