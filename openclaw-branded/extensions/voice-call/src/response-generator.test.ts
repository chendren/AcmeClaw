import { describe, expect, it } from "vitest";
import {
  classifyFastVoiceResponse,
  classifyVoiceTranscriptHeuristic,
  isLikelyGarbledVoiceTranscript,
  isLikelyTranscriptEcho,
  parseVoiceResponseDecision,
} from "./response-generator.js";

describe("response-generator heuristics", () => {
  it("waits on standalone recording disclosures", () => {
    expect(
      classifyVoiceTranscriptHeuristic("This call may be recorded for quality assurance.", []),
    ).toEqual({
      action: "wait",
      reason: "recording-disclosure",
    });
  });

  it("does not suppress actionable prompts that include disclosure text", () => {
    expect(
      classifyVoiceTranscriptHeuristic(
        "This call may be recorded. How can I help you today?",
        [],
      ),
    ).toBeNull();
  });

  it("waits on echoed bot speech", () => {
    expect(
      isLikelyTranscriptEcho("Thanks, that is all I needed.", [
        { speaker: "bot", text: "Thanks, that is all I needed." },
      ]),
    ).toBe(true);
  });

  it("treats short non-actionable gibberish as garbled", () => {
    expect(isLikelyGarbledVoiceTranscript("խաղը։")).toBe(true);
  });
});

describe("response-generator structured decision parsing", () => {
  it("parses fenced JSON planner output", () => {
    expect(
      parseVoiceResponseDecision(
        '```json\n{"action":"hangup","speech":"Thanks, that is all I needed.","reason":"objective answered"}\n```',
      ),
    ).toEqual({
      action: "hangup",
      speech: "Thanks, that is all I needed.",
      reason: "objective answered",
    });
  });

  it("parses dtmf planner output", () => {
    expect(
      parseVoiceResponseDecision('{"action":"dtmf","digits":"ww123#","reason":"ivr menu"}'),
    ).toEqual({
      action: "dtmf",
      digits: "ww123#",
      reason: "ivr menu",
    });
  });
});

describe("response-generator fast-path responses", () => {
  it("returns an immediate billing response for service-intent prompts", () => {
    expect(
      classifyFastVoiceResponse(
        "In a few words, what can I help you with?",
        "Goal: navigate to the billing branch. If the IVR asks how it can help, say exactly: Billing.",
      ),
    ).toEqual({
      action: "speak",
      text: "Billing.",
      reason: "fast-service-intent",
    });
  });

  it("returns DTMF digits when the IVR prompt supports keypad entry", () => {
    expect(
      classifyFastVoiceResponse(
        "Please enter or say your mobile number, area code first.",
        "Use account number 4029732385 when asked for the mobile number.",
      ),
    ).toEqual({
      action: "dtmf",
      text: null,
      digits: "4029732385",
      reason: "fast-number-entry-dtmf",
      delayMs: 1200,
    });
  });

  it("keeps spoken number entry when the IVR only asks for speech", () => {
    expect(
      classifyFastVoiceResponse(
        "Please say the 10-digit mobile number you're calling about.",
        "Use account number 4029732385 when asked for the mobile number.",
      ),
    ).toEqual({
      action: "speak",
      text: "4 0 2, 9 7 3, 2 3 8 5",
      reason: "fast-number-entry-speech",
      delayMs: 1200,
    });
  });

  it("returns the configured fallback when no account number is available", () => {
    expect(
      classifyFastVoiceResponse(
        "To continue, say the T-Mobile number you're calling about. Or say, I don't have one.",
        "If it asks for your phone number, say once: I do not have it with me.",
      ),
    ).toEqual({
      action: "speak",
      text: "I do not have it with me.",
      reason: "fast-missing-number",
      delayMs: 1200,
    });
  });
});
