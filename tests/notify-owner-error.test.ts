/**
 * notifyOwnerError — prod error alerting to the owner.
 *
 * Guarantees under test:
 *   1. Sends ONE DM to OWNER_CHAT_ID containing the context + error message.
 *   2. Throttles repeated identical errors (no spam within the window).
 *   3. Does NOT throttle distinct errors.
 *   4. NEVER throws — even if sendMessage rejects (safe inside any catch block).
 *   5. Handles non-Error throwables.
 *
 * Throttle state is module-global, so each test uses a UNIQUE context+message.
 */
import { describe, it, expect, vi } from "vitest";
import type { Api } from "grammy";
import { notifyOwnerError, OWNER_CHAT_ID } from "@/lib/telegram/notifyOwnerError";

function makeApi(send = vi.fn().mockResolvedValue({})) {
  return { api: { sendMessage: send } as unknown as Api, send };
}

describe("notifyOwnerError", () => {
  it("sends one DM to the owner with context + error message", async () => {
    const { api, send } = makeApi();
    await notifyOwnerError(api, "ctx-1", new Error("boom-1"));
    expect(send).toHaveBeenCalledTimes(1);
    const [chatId, text] = send.mock.calls[0];
    expect(chatId).toBe(OWNER_CHAT_ID);
    expect(String(text)).toContain("ctx-1");
    expect(String(text)).toContain("boom-1");
  });

  it("throttles repeated identical errors", async () => {
    const { api, send } = makeApi();
    await notifyOwnerError(api, "ctx-2", new Error("boom-2"));
    await notifyOwnerError(api, "ctx-2", new Error("boom-2"));
    await notifyOwnerError(api, "ctx-2", new Error("boom-2"));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does NOT throttle distinct errors", async () => {
    const { api, send } = makeApi();
    await notifyOwnerError(api, "ctx-3", new Error("err-a"));
    await notifyOwnerError(api, "ctx-3", new Error("err-b"));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("never throws even if sendMessage rejects", async () => {
    const send = vi.fn().mockRejectedValue(new Error("telegram down"));
    const { api } = makeApi(send);
    await expect(
      notifyOwnerError(api, "ctx-4", new Error("boom-4"))
    ).resolves.toBeUndefined();
  });

  it("handles non-Error throwables", async () => {
    const { api, send } = makeApi();
    await notifyOwnerError(api, "ctx-5", "string failure");
    expect(send).toHaveBeenCalledTimes(1);
    expect(String(send.mock.calls[0][1])).toContain("string failure");
  });
});
