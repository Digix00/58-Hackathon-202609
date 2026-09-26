import {
  type DisplaySettingsInput,
  type User,
  type UserProfileInput,
  validateDisplaySettings,
  validateUserProfile,
} from "../entity/user";
import type { UserRepository } from "../repository/auth.repository";

export interface IUserUseCase {
  updateProfile(userId: string, input: UserProfileInput): Promise<User>;
  updateDisplaySettings(
    userId: string,
    input: DisplaySettingsInput,
  ): Promise<User>;
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

  async updateDisplaySettings(
    userId: string,
    input: DisplaySettingsInput,
  ): Promise<User> {
    const settings = validateDisplaySettings(input);
    return this.users.updateDisplaySettings(userId, settings);
  }
}
