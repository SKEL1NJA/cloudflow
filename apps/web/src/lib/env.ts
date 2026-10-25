import { z } from 'zod';

const parsed = z.object({ VITE_API_URL: z.url() }).safeParse(import.meta.env);

if (!parsed.success) {
  throw new Error(`Invalid frontend configuration:\n${z.prettifyError(parsed.error)}`);
}

export const env = { apiUrl: parsed.data.VITE_API_URL.replace(/\/+$/, '') };
