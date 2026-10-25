import { z } from 'zod';

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedApiKey extends ApiKeyView {
  key: string;
}

export interface ApiKeyListResponse {
  data: ApiKeyView[];
}
