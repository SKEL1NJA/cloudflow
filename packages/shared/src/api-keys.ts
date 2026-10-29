import { z } from 'zod';

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, 'Enter a name for the key').max(100, 'Use at most 100 characters'),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

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
