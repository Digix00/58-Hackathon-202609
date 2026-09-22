export interface Session {
  id: string;
  userId: string | null;
  expiresAt: string;
}
