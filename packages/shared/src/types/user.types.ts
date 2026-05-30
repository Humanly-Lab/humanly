export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name?: string | null;
  profileCompleted: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreateInput {
  email: string;
  password: string;
  role?: UserRole;
}

export interface UserLoginInput {
  email: string;
  password: string;
  role?: UserRole;
}

export interface UserWithPassword extends User {
  passwordHash: string;
  emailVerificationToken?: string | null;
  emailVerificationExpires?: Date | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;
  passwordResetRequestedAt?: Date | null;
}
