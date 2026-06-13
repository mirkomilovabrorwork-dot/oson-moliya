import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../env";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  const env = getEnv();
  _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}
