export interface User {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileCompleted: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreateInput {
  email: string;
  password: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface UserLoginInput {
  email: string;
  password: string;
}

export interface UserWithPassword extends User {
  passwordHash: string;
  emailVerificationToken?: string | null;
  emailVerificationExpires?: Date | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;
  passwordResetRequestedAt?: Date | null;
}
