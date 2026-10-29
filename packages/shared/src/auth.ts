import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Use at most 254 characters')
  .pipe(z.email('Enter a valid email address'));

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().max(100, 'Use at most 100 characters'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one',
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export interface SessionView {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  signedInAt: string;
  lastActiveAt: string;
  expiresAt: string;
  current: boolean;
}

export interface SessionListResponse {
  data: SessionView[];
}

export interface ChangePasswordResponse {
  revokedSessions: number;
}
