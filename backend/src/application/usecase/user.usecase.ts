import {
  type DisplayLanguage,
  type User,
  type UserProfileInput,
  validateDisplayLanguage,
  validateUserProfile,
} from "../entity/user";
import type { UserRepository } from "../repository/auth.repository";

export interface IUserUseCase {
  updateProfile(userId: string, input: UserProfileInput): Promise<User>;
  updateDisplayLanguage(userId: string, value: string): Promise<User>;
}

export class UserUseCase implements IUserUseCase {
  private readonly users: UserRepository;
  private readonly now: () => Date;

  constructor(users: UserRepository, now: () => Date = () => new Date()) {
    this.users = users;
    this.now = now;
  }

  async updateProfile(userId: string, input: UserProfileInput): Promise<User> {
    const profile = validateUserProfile(input, this.now());
    return this.users.updateProfile(userId, profile);
  }

  async updateDisplayLanguage(userId: string, value: string): Promise<User> {
    const displayLanguage: DisplayLanguage = validateDisplayLanguage(value);
    return this.users.updateDisplayLanguage(userId, displayLanguage);
  }
}
