import { AuthService } from "../../src/application/auth/auth.service";
import { AuthHandler } from "../../src/presentation/auth.handler";

export function createAuthDependencies() {
  const authService = new AuthService(
    {
      findOrCreateByLineUserId: async () => {
        throw new Error("auth fixture is not used by this test");
      },
      findById: async () => {
        throw new Error("auth fixture is not used by this test");
      },
    },
    {
      create: async () => {
        throw new Error("auth fixture is not used by this test");
      },
      findByTokenHash: async () => {
        throw new Error("auth fixture is not used by this test");
      },
      revokeByTokenHash: async () => {
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
    authHandler: new AuthHandler(authService),
    authService,
  };
}
