import type { ChannelProfile } from '@/core/types';
import fa from '@/i18n/fa.json';

// Sample channel for demo mode. Temporary: fixtures has no sample channel profile yet; once the
// Content lane adds an official one there, this should read it instead.
export const sampleChannel: ChannelProfile = {
  name: fa.studio.demo.channelName,
  niche: fa.studio.demo.niche,
  audience: fa.studio.demo.audience,
  tone: 'casual',
  avgLengthMin: 8,
  sampleText: fa.studio.demo.sampleText,
};
