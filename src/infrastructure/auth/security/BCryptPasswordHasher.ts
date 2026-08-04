import bcrypt from 'bcryptjs';

import type { PasswordHasher } from '../../../application/auth/ports';

export class BCryptPasswordHasher implements PasswordHasher {
  constructor(
    private readonly saltRounds = 12,
  ) {}

  public async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  public async compare(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}
