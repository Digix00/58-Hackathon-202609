import { describe, expect, it } from "vitest";

import type { User } from "../../../src/application/entity/user";
import { UserProfileValidationError } from "../../../src/application/entity/user-profile";
import type { UserRepository } from "../../../src/application/repository/auth.repository";
import { UserUseCase } from "../../../src/application/usecase/user.usecase";

const existingUser: User = {
  id: "user_1",
  lineUserId: "line_user_1",
  birthYear: null,
  birthMonth: null,
  gender: null,
  regionCode: null,
};

function createRepository() {
  let updated: User | undefined;
  const repository: UserRepository = {
    selectOrCreateByLineUserId: async () => existingUser,
    selectById: async () => existingUser,
    updateProfile: async (userId, profile) => {
      updated = {
        ...existingUser,
        id: userId,
        birthYear: profile.birthYear,
        birthMonth: profile.birthMonth,
        gender: profile.gender,
        regionCode: profile.regionCode,
      };
      return updated;
    },
  };

  return { repository, getUpdated: () => updated };
}

describe("UserUseCase", () => {
  it("validates and persists a year-month profile", async () => {
    const { repository, getUpdated } = createRepository();
    const useCase = new UserUseCase(
      repository,
      () => new Date("2026-09-22T00:00:00.000Z"),
    );

    const result = await useCase.updateProfile("user_1", {
      birthYear: 2002,
      birthMonth: 9,
      gender: "no_answer",
      regionCode: "hyogo",
    });

    expect(result).toEqual(getUpdated());
    expect(result).toMatchObject({
      birthYear: 2002,
      birthMonth: 9,
      gender: "no_answer",
      regionCode: "hyogo",
    });
  });

  it("rejects a future month in the current year", async () => {
    const { repository } = createRepository();
    const useCase = new UserUseCase(
      repository,
      () => new Date("2026-09-22T00:00:00.000Z"),
    );

    await expect(
      useCase.updateProfile("user_1", {
        birthYear: 2026,
        birthMonth: 10,
        gender: "no_answer",
        regionCode: "hyogo",
      }),
    ).rejects.toBeInstanceOf(UserProfileValidationError);
  });
});
