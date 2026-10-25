import { z } from 'zod';
import type { ChannelProfile, EntryPoint, Project } from '@/core/types';
import fa from '@/i18n/fa.json';
import { format } from '@/i18n/format';

const e = fa.studio.new.errors;

export const LENGTH_MIN = 1;
export const LENGTH_MAX = 180;
export const MAX_LENGTH = { title: 120, name: 80, niche: 120, audience: 200, sampleText: 2000 } as const;

// What the inputs hold: strings, as typed. Parsing turns them into the contract types.
export interface NewProjectValues {
  entry: EntryPoint | '';
  title: string;
  name: string;
  niche: string;
  audience: string;
  tone: ChannelProfile['tone'] | '';
  avgLengthMin: string;
  sampleText: string;
  useColors: boolean;
  colors: { primary: string; accent: string };
}

// Persian (U+06F0–U+06F9) and Arabic-Indic (U+0660–U+0669) digits both end in 0–9 in hex.
function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) % 16));
}

const tooLong = (max: number) => ({ error: format(e.tooLong, { max }) });
const requiredText = (error: string, max: number) => z.string().trim().min(1, { error }).max(max, tooLong(max));
const color = z.string().regex(/^#[0-9a-f]{6}$/i, { error: e.color });
const lengthRange = { error: format(e.lengthInvalid, { min: LENGTH_MIN, max: LENGTH_MAX }) };

// The channel part is exactly ChannelProfile from src/core/types.ts (checked below).
const channelSchema = z.object({
  name: requiredText(e.name, MAX_LENGTH.name),
  niche: requiredText(e.niche, MAX_LENGTH.niche),
  audience: requiredText(e.audience, MAX_LENGTH.audience),
  tone: z.enum(['formal', 'casual', 'mixed'], { error: e.tone }),
  avgLengthMin: z
    .string()
    .trim()
    .min(1, { error: e.lengthRequired })
    .transform((text) => Number(toLatinDigits(text)))
    .pipe(z.number(lengthRange).int(lengthRange).min(LENGTH_MIN, lengthRange).max(LENGTH_MAX, lengthRange)),
  sampleText: z
    .string()
    .trim()
    .max(MAX_LENGTH.sampleText, tooLong(MAX_LENGTH.sampleText))
    .transform((text) => text || undefined)
    .optional(),
  colors: z.object({ primary: color, accent: color }).optional(),
});

const projectSchema = z.object({
  entry: z.enum(['idea', 'raw-video'], { error: e.entry }),
  title: z.string().trim().max(MAX_LENGTH.title, tooLong(MAX_LENGTH.title)),
  channel: channelSchema,
});

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type SameShape<A, B> = Same<A, B> extends true ? Same<keyof A, keyof B> : false;

// Fails to compile if the form's channel ever drifts from the contract's ChannelProfile.
export const channelMatchesContract: SameShape<z.output<typeof channelSchema>, ChannelProfile> = true;

export type NewProjectErrors = Partial<Record<keyof NewProjectValues | 'colors.primary' | 'colors.accent', string>>;

export type NewProjectResult =
  | { success: true; project: Pick<Project, 'title' | 'entry' | 'channel'> }
  | { success: false; errors: NewProjectErrors };

export function parseNewProject(values: NewProjectValues): NewProjectResult {
  const result = projectSchema.safeParse({
    entry: values.entry,
    title: values.title,
    channel: {
      name: values.name,
      niche: values.niche,
      audience: values.audience,
      tone: values.tone,
      avgLengthMin: values.avgLengthMin,
      sampleText: values.sampleText,
      colors: values.useColors ? values.colors : undefined,
    },
  });

  if (!result.success) {
    const errors: NewProjectErrors = {};
    for (const issue of result.error.issues) {
      // channel.name -> name, channel.colors.primary -> colors.primary
      const key = issue.path.filter((part) => part !== 'channel').join('.') as keyof NewProjectErrors;
      errors[key] ??= issue.message;
    }
    return { success: false, errors };
  }

  const { entry, title, channel } = result.data;
  return {
    success: true,
    project: { entry, channel, title: title || format(fa.studio.new.defaultTitle, { name: channel.name }) },
  };
}
