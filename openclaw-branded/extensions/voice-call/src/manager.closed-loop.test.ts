import { describe, expect, it } from "vitest";
import { createManagerHarness, FakeProvider, markCallAnswered } from "./manager.test-harness.js";

describe("CallManager closed-loop turns", () => {
  it("completes a closed-loop turn without live audio", async () => {
    const { manager, provider } = await createManagerHarness({
      transcriptTimeoutMs: 5000,
    });

    const started = await manager.initiateCall("+15550000003");
    expect(started.success).toBe(true);

    markCallAnswered(manager, started.callId, "evt-closed-loop-answered");

    const turnPromise = manager.continueCall(started.callId, "How can I help?");
    await new Promise((resolve) => setTimeout(resolve, 0));

    manager.processEvent({
      id: "evt-closed-loop-speech",
      type: "call.speech",
      callId: started.callId,
      providerCallId: "request-uuid",
      timestamp: Date.now(),
      transcript: "Please check status",
      isFinal: true,
    });

    const turn = await turnPromise;
    expect(turn.success).toBe(true);
    expect(turn.transcript).toBe("Please check status");
    expect(provider.startListeningCalls).toHaveLength(1);
    expect(provider.stopListeningCalls).toHaveLength(1);

    const call = manager.getCall(started.callId);
    expect(call?.transcript.map((entry) => entry.text)).toEqual([
      "How can I help?",
      "Please check status",
    ]);
    const metadata = (call?.metadata ?? {}) as Record<string, unknown>;
    expect(typeof metadata.lastTurnLatencyMs).toBe("number");
    expect(typeof metadata.lastTurnListenWaitMs).toBe("number");
    expect(metadata.turnCount).toBe(1);
  });

  it("rejects overlapping continueCall requests for the same call", async () => {
    const { manager, provider } = await createManagerHarness({
      transcriptTimeoutMs: 5000,
    });

    const started = await manager.initiateCall("+15550000004");
    expect(started.success).toBe(true);

    markCallAnswered(manager, started.callId, "evt-overlap-answered");

    const first = manager.continueCall(started.callId, "First prompt");
    const second = await manager.continueCall(started.callId, "Second prompt");
    expect(second.success).toBe(false);
    expect(second.error).toBe("Already waiting for transcript");

    manager.processEvent({
      id: "evt-overlap-speech",
      type: "call.speech",
      callId: started.callId,
      providerCallId: "request-uuid",
      timestamp: Date.now(),
      transcript: "Done",
      isFinal: true,
    });

    const firstResult = await first;
    expect(firstResult.success).toBe(true);
    expect(firstResult.transcript).toBe("Done");
    expect(provider.startListeningCalls).toHaveLength(1);
    expect(provider.stopListeningCalls).toHaveLength(1);
  });

  it("ignores speech events with mismatched turnToken while waiting for transcript", async () => {
    const { manager, provider } = await createManagerHarness(
      {
        transcriptTimeoutMs: 5000,
      },
      new FakeProvider("twilio"),
    );

    const started = await manager.initiateCall("+15550000004");
    expect(started.success).toBe(true);

    markCallAnswered(manager, started.callId, "evt-turn-token-answered");

    const turnPromise = manager.continueCall(started.callId, "Prompt");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const expectedTurnToken = provider.startListeningCalls[0]?.turnToken;
    expect(typeof expectedTurnToken).toBe("string");

    manager.processEvent({
      id: "evt-turn-token-bad",
      type: "call.speech",
      callId: started.callId,
      providerCallId: "request-uuid",
      timestamp: Date.now(),
      transcript: "stale replay",
      isFinal: true,
      turnToken: "wrong-token",
    });

    const pendingState = await Promise.race([
      turnPromise.then(() => "resolved"),
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 0)),
    ]);
    expect(pendingState).toBe("pending");

    manager.processEvent({
      id: "evt-turn-token-good",
      type: "call.speech",
      callId: started.callId,
      providerCallId: "request-uuid",
      timestamp: Date.now(),
      transcript: "final answer",
      isFinal: true,
      turnToken: expectedTurnToken,
    });

    const turnResult = await turnPromise;
    expect(turnResult.success).toBe(true);
    expect(turnResult.transcript).toBe("final answer");

    const call = manager.getCall(started.callId);
    expect(call?.transcript.map((entry) => entry.text)).toEqual(["Prompt", "final answer"]);
  });

  it("tracks latency metadata across multiple closed-loop turns", async () => {
    const { manager, provider } = await createManagerHarness({
      transcriptTimeoutMs: 5000,
    });

    const started = await manager.initiateCall("+15550000005");
    expect(started.success).toBe(true);

    markCallAnswered(manager, started.callId, "evt-multi-answered");

    const firstTurn = manager.continueCall(started.callId, "First question");
    await new Promise((resolve) => setTimeout(resolve, 0));
    manager.processEvent({
      id: "evt-multi-speech-1",
      type: "call.speech",
      callId: started.callId,
      providerCallId: "request-uuid",
      timestamp: Date.now(),
      transcript: "First answer",
      isFinal: true,
    });
    await firstTurn;

    const secondTurn = manager.continueCall(started.callId, "Second question");
    await new Promise((resolve) => setTimeout(resolve, 0));
    manager.processEvent({
      id: "evt-multi-speech-2",
      type: "call.speech",
      callId: started.callId,
      providerCallId: "request-uuid",
      timestamp: Date.now(),
      transcript: "Second answer",
      isFinal: true,
    });
    const secondResult = await secondTurn;

    expect(secondResult.success).toBe(true);

    const call = manager.getCall(started.callId);
    expect(call?.transcript.map((entry) => entry.text)).toEqual([
      "First question",
      "First answer",
      "Second question",
      "Second answer",
    ]);
    const metadata = (call?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.turnCount).toBe(2);
    expect(typeof metadata.lastTurnLatencyMs).toBe("number");
    expect(typeof metadata.lastTurnListenWaitMs).toBe("number");
    expect(provider.startListeningCalls).toHaveLength(2);
    expect(provider.stopListeningCalls).toHaveLength(2);
  });

  it("handles repeated closed-loop turns without waiter churn", async () => {
    const { manager, provider } = await createManagerHarness({
      transcriptTimeoutMs: 5000,
    });

    const started = await manager.initiateCall("+15550000006");
    expect(started.success).toBe(true);

    markCallAnswered(manager, started.callId, "evt-loop-answered");

    for (let i = 1; i <= 5; i++) {
      const turnPromise = manager.continueCall(started.callId, `Prompt ${i}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      manager.processEvent({
        id: `evt-loop-speech-${i}`,
        type: "call.speech",
        callId: started.callId,
        providerCallId: "request-uuid",
        timestamp: Date.now(),
        transcript: `Answer ${i}`,
        isFinal: true,
      });
      const result = await turnPromise;
      expect(result.success).toBe(true);
      expect(result.transcript).toBe(`Answer ${i}`);
    }

    const call = manager.getCall(started.callId);
    const metadata = (call?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.turnCount).toBe(5);
    expect(provider.startListeningCalls).toHaveLength(5);
    expect(provider.stopListeningCalls).toHaveLength(5);
  });

  it("sends outbound DTMF through the provider and records the action", async () => {
    const { manager, provider } = await createManagerHarness(
      {
        provider: "twilio",
      },
      new FakeProvider("twilio"),
    );

    const started = await manager.initiateCall("+15550000007");
    expect(started.success).toBe(true);

    markCallAnswered(manager, started.callId, "evt-dtmf-answered");

    const result = await manager.sendDtmf(started.callId, "402 973 2385");
    expect(result.success).toBe(true);
    expect(provider.sendDtmfCalls).toEqual([
      {
        callId: started.callId,
        providerCallId: "request-uuid",
        digits: "4029732385",
      },
    ]);

    const call = manager.getCall(started.callId);
    expect(call?.transcript.at(-1)?.text).toBe("[DTMF] 4029732385");
    const metadata = (call?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.lastDtmfDigits).toBe("4029732385");
    expect(typeof metadata.lastDtmfSentAt).toBe("number");
    expect(typeof metadata.dtmfStreamReconnectExpectedUntil).toBe("number");
  });

  it("returns a queued transcript immediately when waitForPrompt starts after speech arrives", async () => {
    const { manager, provider } = await createManagerHarness(
      {
        provider: "twilio",
      },
      new FakeProvider("twilio"),
    );

    const started = await manager.initiateCall("+15550000008");
    expect(started.success).toBe(true);

    markCallAnswered(manager, started.callId, "evt-buffered-wait-answered");

    manager.processEvent({
      id: "evt-buffered-wait-speech",
      type: "call.speech",
      callId: started.callId,
      providerCallId: "request-uuid",
      timestamp: Date.now(),
      transcript: "Queued prompt",
      isFinal: true,
    });

    const result = await manager.waitForPrompt(started.callId);
    expect(result.success).toBe(true);
    expect(result.transcript).toBe("Queued prompt");
    expect(provider.startListeningCalls).toHaveLength(0);
    expect(provider.stopListeningCalls).toHaveLength(0);

    const call = manager.getCall(started.callId);
    const metadata = (call?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.turnCount).toBe(1);
    expect(metadata.lastTurnAction).toBe("wait");
    expect(metadata.lastTurnLatencyMs).toBe(0);
    expect(metadata.lastTurnListenWaitMs).toBe(0);
    expect(metadata.pendingUserTranscripts).toBeUndefined();
  });

  it("rejects invalid DTMF sequences before calling the provider", async () => {
    const { manager, provider } = await createManagerHarness(
      {
        provider: "twilio",
      },
      new FakeProvider("twilio"),
    );

    const started = await manager.initiateCall("+15550000009");
    expect(started.success).toBe(true);

    markCallAnswered(manager, started.callId, "evt-invalid-dtmf-answered");

    const result = await manager.sendDtmf(started.callId, "press one");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid DTMF sequence");
    expect(provider.sendDtmfCalls).toHaveLength(0);
  });
});
