import {
  type User,
  type UserProfilePatch,
  UserProfileValidationError,
  validateUserProfilePatch,
} from "../entity/user";
import type { UserRepository as UserRepositoryPort } from "../repository/auth.repository";

export interface UserUseCasePort {
  updateProfile(userId: string, input: UserProfilePatch): Promise<User>;
}

export class UserNotFoundError extends Error {
  constructor() {
    super("user not found");
    this.name = "UserNotFoundError";
  }
}

export class UserUseCase implements UserUseCasePort {
  private readonly users: UserRepositoryPort;

  constructor(users: UserRepositoryPort) {
    this.users = users;
  }

  async updateProfile(userId: string, input: UserProfilePatch): Promise<User> {
    const profile = validateUserProfilePatch(input);
    if (Object.keys(profile).length === 0) {
      throw new UserProfileValidationError(
        "profile",
        "at least one profile field is required",
      );
    }

    const user = await this.users.updateProfile(userId, profile);
    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }
}
