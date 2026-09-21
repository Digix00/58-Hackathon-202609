import { AuthUseCase } from "../../src/application/usecase/auth.usecase";
import { AuthHandler } from "../../src/presentation/auth.handler";

export function createAuthDependencies() {
  const authUseCase = new AuthUseCase(
    {
      selectOrCreateByLineUserId: async () => {
        throw new Error("auth fixture is not used by this test");
      },
      selectById: async () => {
        throw new Error("auth fixture is not used by this test");
      },
    },
    {
      insert: async () => {
        throw new Error("auth fixture is not used by this test");
      },
      selectByTokenHash: async () => {
        throw new Error("auth fixture is not used by this test");
      },
      updateRevokedAtByTokenHash: async () => {
        throw new Error("auth fixture is not used by this test");
      },
    },
    {
      verify: async () => {
        throw new Error("auth fixture is not used by this test");
      },
    },
  );

  return {
    authHandler: new AuthHandler(authUseCase),
    authUseCase,
  };
}
