import {
  validateUserProfile,
  type User,
  type UserProfileInput,
} from "../entity/user";
import type { UserRepository } from "../repository/auth.repository";

export interface IUserUseCase {
  updateProfile(userId: string, input: UserProfileInput): Promise<User>;
}

export class UserUseCase implements IUserUseCase {
  private readonly users: UserRepository;
  private readonly now: () => Date;

  constructor(users: UserRepository, now: () => Date = () => new Date()) {
    this.users = users;
    this.now = now;
  }

  async updateProfile(
    userId: string,
    input: UserProfileInput,
  ): Promise<User> {
    const profile = validateUserProfile(input, this.now());
    return this.users.updateProfile(userId, profile);
  }
}
