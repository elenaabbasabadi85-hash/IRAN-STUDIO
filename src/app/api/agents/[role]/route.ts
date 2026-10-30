// Runs one content agent for a channel: POST /api/agents/<role> with { channel, input }.
// The OpenRouter key stays on the server; without it the agent answers from fixtures (demo mode).
// Runs on the default Node.js runtime; Cache Components does not allow a `runtime` export.
import { runAgent, type AgentError } from "@/agents/runAgent";
import {
  agentRequestSchema,
  isAgentRole,
  type AgentErrorResponse,
  type AgentResponse,
} from "@/agents/schemas";
import t from "@/agents/strings.fa.json";

export const maxDuration = 60;

/** Room for a full channel profile plus the agent's input (e.g. a whole script). */
const MAX_BODY_CHARS = 32_000;

const ERRORS: Record<AgentError, { status: number; message: string }> = {
  rate_limited: { status: 429, message: t.errors.rateLimited },
  timeout: { status: 504, message: t.errors.timeout },
  upstream: { status: 502, message: t.errors.upstream },
  invalid_output: { status: 502, message: t.errors.invalidOutput },
  internal: { status: 500, message: t.errors.internal },
};

function fail(status: number, error: string): Response {
  const body: AgentErrorResponse = { error };
  return Response.json(body, { status });
}

export async function POST(request: Request, ctx: RouteContext<"/api/agents/[role]">): Promise<Response> {
  const { role } = await ctx.params;
  if (!isAgentRole(role)) {
    return fail(404, t.errors.unknownRole);
  }

  let json: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) {
      return fail(413, t.errors.tooLarge);
    }
    json = JSON.parse(text);
  } catch {
    return fail(400, t.errors.badRequest);
  }

  const parsed = agentRequestSchema.safeParse(json);
  if (!parsed.success) {
    return fail(400, t.errors.badRequest);
  }

  const result = await runAgent(role, parsed.data.channel, parsed.data.input);
  if (!result.ok) {
    const { status, message } = ERRORS[result.error];
    return fail(status, message);
  }
  const body: AgentResponse = { data: result.data, demo: result.demo, model: result.model };
  return Response.json(body);
}
