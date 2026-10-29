export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

export function toPublicUser(user: PublicUser): PublicUser {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}
