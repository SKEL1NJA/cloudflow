import type { StepType } from '@cloudflow/shared';
import { Bell, Globe, Shuffle, Timer, type LucideIcon } from 'lucide-react';

export const STEP_ICONS: Record<StepType, LucideIcon> = {
  HTTP_REQUEST: Globe,
  DELAY: Timer,
  TRANSFORM: Shuffle,
  NOTIFICATION: Bell,
};
