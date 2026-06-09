export type SessionUser = {
  id: string;
  full_name?: string;
  fullName?: string;
  email: string;
  role: string;
  email_verified?: boolean;
  emailVerified?: boolean;
};

export type AuthResult = {
  sessionToken: string;
  expiresAt: string;
  user: SessionUser;
};