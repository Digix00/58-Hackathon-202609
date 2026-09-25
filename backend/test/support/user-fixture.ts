import { UserHandler } from "../../src/presentation/user.handler";

export function createUserDependencies() {
  return {
    userHandler: new UserHandler({
      updateProfile: async () => {
        throw new Error("user fixture is not used by this test");
      },
      updateDisplayLanguage: async () => {
        throw new Error("user fixture is not used by this test");
      },
    }),
  };
}
