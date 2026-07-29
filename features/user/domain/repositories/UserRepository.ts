import type { Repository } from '../../../../lib/core';
import type { User } from '../entities';

export interface UserRepository
  extends Repository<User, string> {
  findByEmail(email: string): Promise<User | null>;
}
