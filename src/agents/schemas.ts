// Zod schemas for agent requests and outputs, plus the response types of POST /api/agents/<role>.
// No server-only code here, so studio pages can import these types later.
//
// چرا Zod؟ پاسخ مدل فقط متن است و TypeScript فقط هنگام کامپایل بررسی می‌کند، نه هنگام اجرا.
// Zod شکل داده را هنگام اجرا بررسی می‌کند، پیام خطای دقیقی می‌دهد که می‌شود برای اصلاح به خود مدل
// برگرداند، و از همین اسکیما JSON Schema می‌سازد تا به مدل بگوییم دقیقاً چه شکلی می‌خواهیم.
// یک منبع حقیقت برای هر سه کار: اعتبارسنجی، پیام خطا و دستور به مدل.
import { z } from "zod";
import type { ChannelProfile } from "@/core/types";

// Mirrors MAX_LENGTH, LENGTH_MIN, LENGTH_MAX and the color rule in src/app/studio/new/schema.ts
// (Platform lane). Copied, not imported, so this lane never depends on another lane's files.
const CHANNEL_LIMITS = {
  name: 80,
  niche: 120,
  audience: 200,
  sampleText: 2000,
  lengthMin: 1,
  lengthMax: 180,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const channelProfileSchema = z.object({
  name: text(CHANNEL_LIMITS.name),
  niche: text(CHANNEL_LIMITS.niche),
  audience: text(CHANNEL_LIMITS.audience),
  tone: z.enum(["formal", "casual", "mixed"]),
  avgLengthMin: z.number().int().min(CHANNEL_LIMITS.lengthMin).max(CHANNEL_LIMITS.lengthMax),
  sampleText: z.string().trim().max(CHANNEL_LIMITS.sampleText).optional(),
  colors: z.object({ primary: color, accent: color }).optional(),
});

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Fails to compile if this schema ever drifts from ChannelProfile in src/core/types.ts.
export const channelMatchesContract: Same<z.output<typeof channelProfileSchema>, ChannelProfile> = true;

export const agentRequestSchema = z.object({
  channel: channelProfileSchema,
  /** What this run works on (e.g. the chosen idea); its shape depends on the agent. */
  input: z.unknown().optional(),
});

export const testOutputSchema = z.object({
  message: z.string().trim().min(1),
});

// The agents the route accepts. A role is added here together with its prompt in prompts/ and its
// sample in fixtures/; runAgent fails to compile until all three exist.
export const agentSchemas = {
  test: testOutputSchema,
} as const;

export type AgentRole = keyof typeof agentSchemas;
export type AgentOutput<R extends AgentRole = AgentRole> = z.output<(typeof agentSchemas)[R]>;

export function isAgentRole(value: string): value is AgentRole {
  return Object.hasOwn(agentSchemas, value);
}

export interface AgentResponse<R extends AgentRole = AgentRole> {
  data: AgentOutput<R>;
  /** True when the server has no API key and returned the sample in fixtures. */
  demo: boolean;
  /** The OpenRouter model that answered; null in demo mode. */
  model: string | null;
}

export interface AgentErrorResponse {
  /** Persian message, safe to show to the user. */
  error: string;
}
