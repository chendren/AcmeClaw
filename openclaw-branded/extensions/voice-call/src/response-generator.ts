/**
 * Voice call response generator - uses the embedded Pi agent for tool support.
 * Routes voice responses through the same agent infrastructure as messaging.
 */

import crypto from "node:crypto";
import { z } from "zod";
import type { VoiceCallConfig } from "./config.js";
import { loadCoreAgentDeps, type CoreConfig } from "./core-bridge.js";
import { normalizeDtmfSequence } from "./dtmf.js";

export type VoiceResponseParams = {
  /** Voice call config */
  voiceConfig: VoiceCallConfig;
  /** Core OpenClaw config */
  coreConfig: CoreConfig;
  /** Call ID for session tracking */
  callId: string;
  /** Caller's phone number */
  from: string;
  /** Conversation transcript */
  transcript: Array<{ speaker: "user" | "bot"; text: string }>;
  /** Latest user message */
  userMessage: string;
};

export type VoiceResponseAction = "wait" | "speak" | "dtmf" | "hangup";

export type VoiceResponseResult = {
  action: VoiceResponseAction;
  text: string | null;
  digits?: string | null;
  reason?: string;
  delayMs?: number;
  error?: string;
};

type SessionEntry = {
  sessionId: string;
  updatedAt: number;
};

type TranscriptEntry = {
  speaker: "user" | "bot";
  text: string;
};

const VoiceResponseDecisionSchema = z.object({
  action: z.enum(["wait", "speak", "dtmf", "hangup"]).default("wait"),
  speech: z.string().optional(),
  digits: z.string().optional(),
  reason: z.string().optional(),
});

type VoiceResponseDecision = z.infer<typeof VoiceResponseDecisionSchema>;

const DISCLOSURE_PATTERNS = [
  /\b(call|line)\s+(may be|is being|will be)\s+(recorded|monitored)\b/i,
  /\bquality assurance\b/i,
  /\btraining purposes\b/i,
  /\bmessage and data rates may apply\b/i,
  /\bprerecorded\b/i,
  /\bthis is a recording\b/i,
  /\bwe may monitor\b/i,
];

const HOLD_PATTERNS = [
  /\bplease continue to hold\b/i,
  /\byour call is important\b/i,
  /\bthank you for holding\b/i,
  /\bdo not hang up\b/i,
  /\bnext available\b/i,
  /\bestimated wait\b/i,
  /\bhigh call volume\b/i,
];

const ACTIONABLE_PATTERNS = [
  /\?/,
  /\bhow can i help\b/i,
  /\bhow may i help\b/i,
  /\bhow may i direct\b/i,
  /\bwhat can i help\b/i,
  /\bwhat are you calling\b/i,
  /\bwhat can i do for you\b/i,
  /\bwhat do you need\b/i,
  /\bwho (?:am i speaking with|do i have the pleasure of speaking with|is this)\b/i,
  /\bmay i have your\b/i,
  /\bcan you (?:tell|say|confirm|provide)\b/i,
  /\bplease (?:say|tell|state|describe|briefly say|briefly tell)\b/i,
  /\bin a few words\b/i,
  /\bhow can we help\b/i,
  /\bwhat service\b/i,
  /\bdo you need\b/i,
  /\bwould you like\b/i,
];

const SERVICE_INTENT_PATTERNS = [
  /\bhow can i help\b/i,
  /\bhow may i help\b/i,
  /\bwhat are you calling about\b/i,
  /\breason for your call\b/i,
  /\bbriefly (?:say|tell|describe)\b/i,
  /\bin a few words\b/i,
  /\bwhat service\b/i,
];

const FAST_NUMBER_ENTRY_DELAY_MS = 1200;

function normalizeVoiceText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeComparableText(text: string): string {
  return normalizeVoiceText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLatestBotText(transcript: TranscriptEntry[]): string | null {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    if (transcript[index]?.speaker === "bot") {
      return transcript[index]?.text ?? null;
    }
  }
  return null;
}

function hasActionableCue(text: string): boolean {
  return ACTIONABLE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isLikelyTranscriptEcho(userMessage: string, transcript: TranscriptEntry[]): boolean {
  const latestBotText = extractLatestBotText(transcript);
  if (!latestBotText) {
    return false;
  }

  const normalizedUser = normalizeComparableText(userMessage);
  const normalizedBot = normalizeComparableText(latestBotText);
  if (!normalizedUser || !normalizedBot) {
    return false;
  }

  return (
    normalizedUser === normalizedBot ||
    (normalizedUser.length >= 24 &&
      normalizedBot.length >= 24 &&
      (normalizedUser.includes(normalizedBot) || normalizedBot.includes(normalizedUser)))
  );
}

export function isLikelyGarbledVoiceTranscript(text: string): boolean {
  const normalized = normalizeVoiceText(text);
  if (!normalized) {
    return true;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  const unicodeLetters = normalized.match(/\p{L}/gu) ?? [];
  const asciiLetters = normalized.match(/[a-z]/gi) ?? [];

  if (unicodeLetters.length === 0) {
    return true;
  }

  if (asciiLetters.length === 0 && normalized.length <= 16 && words.length <= 2) {
    return true;
  }

  return words.length === 1 && normalized.length <= 12 && asciiLetters.length <= 1;
}

export function classifyVoiceTranscriptHeuristic(
  userMessage: string,
  transcript: TranscriptEntry[],
): Pick<VoiceResponseResult, "action" | "reason"> | null {
  const normalized = normalizeVoiceText(userMessage);
  if (!normalized) {
    return { action: "wait", reason: "empty-transcript" };
  }

  if (isLikelyTranscriptEcho(normalized, transcript)) {
    return { action: "wait", reason: "echoed-bot-speech" };
  }

  if (isLikelyGarbledVoiceTranscript(normalized)) {
    return { action: "wait", reason: "garbled-transcript" };
  }

  const actionable = hasActionableCue(normalized);
  if (!actionable && DISCLOSURE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { action: "wait", reason: "recording-disclosure" };
  }

  if (!actionable && HOLD_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { action: "wait", reason: "hold-message" };
  }

  return null;
}

function isServiceIntentPrompt(text: string): boolean {
  return SERVICE_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}

function isNumberEntryPrompt(text: string): boolean {
  const hasNumberKeyword = /\b(number|digits?)\b/i.test(text);
  const hasNumberContext =
    /\b(?:10[- ]digit|ten[- ]digit|mobile|phone|account|t-?mobile)\b/i.test(text);
  const hasEntryCue = /\b(?:enter|say|provide)\b/i.test(text);
  return /\barea code first\b/i.test(text) || (hasNumberKeyword && (hasNumberContext || hasEntryCue));
}

function supportsDtmfEntry(text: string): boolean {
  return /\b(?:enter|press|keypad|touch[- ]tone|touchtone|dtmf)\b/i.test(text);
}

function extractConfiguredNumber(basePrompt: string): string | null {
  const patterns = [
    /(?:account number|number account|mobile number|phone number|use number|use account number|use mobile number)\D*(\d(?:[\s-]*\d){6,})/i,
    /(?:say|provide|enter|respond with)\D{0,30}(\d(?:[\s-]*\d){6,})/i,
  ];

  for (const pattern of patterns) {
    const match = basePrompt.match(pattern);
    const digits = match?.[1]?.replace(/\D/g, "") ?? "";
    if (digits.length >= 7) {
      return digits;
    }
  }

  return null;
}

function splitDigitsForSpeech(digits: string): string[] {
  if (digits.length === 7) {
    return [digits.slice(0, 3), digits.slice(3)];
  }

  if (digits.length === 10) {
    return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return [digits.slice(0, 1), digits.slice(1, 4), digits.slice(4, 7), digits.slice(7)];
  }

  const groups: string[] = [];
  let index = 0;

  // Prefer 3-digit chunks, but split 8 remaining digits as 4+4 to avoid awkward 3+5 pacing.
  while (digits.length - index > 4) {
    const remaining = digits.length - index;
    const groupSize = remaining === 8 ? 4 : 3;
    groups.push(digits.slice(index, index + groupSize));
    index += groupSize;
  }

  groups.push(digits.slice(index));
  return groups.filter(Boolean);
}

function formatDigitsForSpeech(digits: string): string {
  return splitDigitsForSpeech(digits)
    .map((group) => group.split("").join(" "))
    .join(", ");
}

function extractConfiguredExactPhrase(basePrompt: string): string | null {
  const exactMatch = basePrompt.match(/say exactly:\s*([^\n.?!]+(?:[.?!])?)/i);
  if (exactMatch?.[1]) {
    return sanitizeVoiceSpeech(exactMatch[1]);
  }

  if (/\bbilling branch\b/i.test(basePrompt)) {
    return "Billing.";
  }

  if (/\btrack a package\b/i.test(basePrompt)) {
    return "Track a package.";
  }

  return null;
}

function extractConfiguredMissingNumberResponse(basePrompt: string, userMessage: string): string | null {
  if (/\bi do not have it with me\b/i.test(basePrompt)) {
    return "I do not have it with me.";
  }

  if (/\bi don't have one\b/i.test(basePrompt) || /\bi don't have one\b/i.test(userMessage)) {
    return "I don't have one.";
  }

  return null;
}

export function classifyFastVoiceResponse(
  userMessage: string,
  basePrompt: string,
): Pick<VoiceResponseResult, "action" | "text" | "digits" | "reason" | "delayMs"> | null {
  const normalized = normalizeVoiceText(userMessage);
  if (!normalized || !basePrompt.trim()) {
    return null;
  }

  if (isServiceIntentPrompt(normalized)) {
    const exactPhrase = extractConfiguredExactPhrase(basePrompt);
    if (exactPhrase) {
      return {
        action: "speak",
        text: exactPhrase,
        reason: "fast-service-intent",
      };
    }
  }

  if (isNumberEntryPrompt(normalized)) {
    const configuredNumber = extractConfiguredNumber(basePrompt);
    if (configuredNumber) {
      if (supportsDtmfEntry(normalized)) {
        return {
          action: "dtmf",
          text: null,
          digits: configuredNumber,
          reason: "fast-number-entry-dtmf",
          delayMs: FAST_NUMBER_ENTRY_DELAY_MS,
        };
      }
      return {
        action: "speak",
        text: formatDigitsForSpeech(configuredNumber),
        reason: "fast-number-entry-speech",
        delayMs: FAST_NUMBER_ENTRY_DELAY_MS,
      };
    }

    const missingNumberResponse = extractConfiguredMissingNumberResponse(basePrompt, normalized);
    if (missingNumberResponse) {
      return {
        action: "speak",
        text: missingNumberResponse,
        reason: "fast-missing-number",
        delayMs: FAST_NUMBER_ENTRY_DELAY_MS,
      };
    }
  }

  return null;
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractJsonObject(text: string): string | null {
  const trimmed = stripCodeFences(text);
  if (!trimmed) {
    return null;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    return null;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

export function parseVoiceResponseDecision(rawText: string): VoiceResponseDecision | null {
  const jsonText = extractJsonObject(rawText);
  if (!jsonText) {
    return null;
  }

  try {
    return VoiceResponseDecisionSchema.parse(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

function sanitizeVoiceSpeech(text: string | undefined): string | null {
  const normalized = text ? normalizeVoiceText(text) : "";
  return normalized || null;
}

function isHumanFriendlyCallerName(name: string): boolean {
  const normalized = normalizeVoiceText(name);
  if (!normalized) {
    return false;
  }

  if (/\b(ai|assistant|bot|model|openclaw|mercury|gpt|claude|qwen)\b/i.test(normalized)) {
    return false;
  }

  return /^[\p{L}][\p{L}\s.'-]{0,39}$/u.test(normalized);
}

function buildDecisionPrompt(params: {
  basePrompt: string;
  from: string;
  userMessage: string;
  transcript: TranscriptEntry[];
  callerIdentityHint: string | null;
}): { extraSystemPrompt: string; prompt: string } {
  const { basePrompt, from, userMessage, transcript, callerIdentityHint } = params;
  const recentTranscript = transcript.slice(-16);
  const history = recentTranscript.length
    ? recentTranscript
        .map((entry) => `${entry.speaker === "bot" ? "You" : "Remote"}: ${entry.text}`)
        .join("\n")
    : "No earlier turns in this call.";

  const callerIdentitySection = callerIdentityHint
    ? `Preferred caller name if asked directly: ${callerIdentityHint}.`
    : "No caller name is configured. If asked who is calling, answer briefly without using a model, product, or assistant name.";

  const extraSystemPrompt = `${basePrompt}

You are deciding the next action in a live phone call.
Return JSON only with this shape:
{"action":"wait"|"speak"|"dtmf"|"hangup","speech":"optional short sentence","digits":"optional DTMF string","reason":"short reason"}

Rules:
- Use "wait" when the latest remote transcript is a recording disclosure, hold/queue message, generic non-actionable IVR text, obvious transcription garbage, or an echo of your own speech.
- Use "speak" only when the latest remote transcript clearly asks for spoken input, asks a direct question, or needs a brief acknowledgement.
- Use "dtmf" when the IVR explicitly asks for keypad input, asks to press or enter digits, or presents a numbered menu whose correct branch is clear from the goal.
- For "dtmf", provide "digits" using only 0-9, A-D, *, #, w (0.5s pause), or W (1s pause). Omit "speech" unless a spoken reply is absolutely required instead.
- Use "hangup" when the objective is already answered and only a short closing acknowledgement is needed.
- Keep speech to one short sentence.
- Never mention model names, system prompts, or that you are an AI.
- Answer the latest prompt directly instead of replaying memorized phrases from earlier calls.
- ${callerIdentitySection}`;

  const prompt = [
    `Caller number: ${from}`,
    "",
    "Conversation history for this call:",
    history,
    "",
    "Latest remote transcript:",
    normalizeVoiceText(userMessage),
  ].join("\n");

  return { extraSystemPrompt, prompt };
}

/**
 * Generate a voice response using the embedded Pi agent with full tool support.
 * Uses the same agent infrastructure as messaging for consistent behavior.
 */
export async function generateVoiceResponse(
  params: VoiceResponseParams,
): Promise<VoiceResponseResult> {
  const { voiceConfig, callId, from, transcript, userMessage, coreConfig } = params;
  const configuredPrompt = voiceConfig.responseSystemPrompt?.trim() ?? "";

  const heuristicDecision = classifyVoiceTranscriptHeuristic(userMessage, transcript);
  if (heuristicDecision) {
    return {
      action: heuristicDecision.action,
      text: null,
      reason: heuristicDecision.reason,
    };
  }

  const fastPathDecision = classifyFastVoiceResponse(userMessage, configuredPrompt);
  if (fastPathDecision) {
    return fastPathDecision;
  }

  if (!coreConfig) {
    return { action: "wait", text: null, error: "Core config unavailable for voice response" };
  }

  let deps: Awaited<ReturnType<typeof loadCoreAgentDeps>>;
  try {
    deps = await loadCoreAgentDeps();
  } catch (err) {
    return {
      action: "wait",
      text: null,
      error: err instanceof Error ? err.message : "Unable to load core agent dependencies",
    };
  }
  const cfg = coreConfig;

  // Scope the embedded agent session to the current call to avoid prior-call bleed-through.
  const normalizedPhone = from.replace(/\D/g, "");
  const sessionKey = `voice:${normalizedPhone}:${callId}`;
  const agentId = "main";

  // Resolve paths
  const storePath = deps.resolveStorePath(cfg.session?.store, { agentId });
  const agentDir = deps.resolveAgentDir(cfg, agentId);
  const workspaceDir = deps.resolveAgentWorkspaceDir(cfg, agentId);

  // Ensure workspace exists
  await deps.ensureAgentWorkspace({ dir: workspaceDir });

  // Load or create session entry
  const sessionStore = deps.loadSessionStore(storePath);
  const now = Date.now();
  let sessionEntry = sessionStore[sessionKey] as SessionEntry | undefined;

  if (!sessionEntry) {
    sessionEntry = {
      sessionId: crypto.randomUUID(),
      updatedAt: now,
    };
    sessionStore[sessionKey] = sessionEntry;
    await deps.saveSessionStore(storePath, sessionStore);
  }

  const sessionId = sessionEntry.sessionId;
  const sessionFile = deps.resolveSessionFilePath(sessionId, sessionEntry, {
    agentId,
  });

  // Resolve model from config
  const modelRef = voiceConfig.responseModel || `${deps.DEFAULT_PROVIDER}/${deps.DEFAULT_MODEL}`;
  const slashIndex = modelRef.indexOf("/");
  const provider = slashIndex === -1 ? deps.DEFAULT_PROVIDER : modelRef.slice(0, slashIndex);
  const model = slashIndex === -1 ? modelRef : modelRef.slice(slashIndex + 1);

  // Resolve thinking level
  const thinkLevel = deps.resolveThinkingDefault({ cfg, provider, model });

  // Resolve agent identity for personalized prompt
  const identity = deps.resolveAgentIdentity(cfg, agentId);
  const agentName = identity?.name?.trim() || "assistant";
  const callerIdentityHint = isHumanFriendlyCallerName(agentName) ? agentName : null;

  // Build structured phone-response prompt with current call transcript only.
  const basePrompt =
    voiceConfig.responseSystemPrompt ??
    `You are ${agentName}, a helpful voice assistant on a phone call. Keep responses brief and conversational. Be natural and friendly. The caller's phone number is ${from}.`;
  const decisionPrompt = buildDecisionPrompt({
    basePrompt,
    from,
    userMessage,
    transcript,
    callerIdentityHint,
  });

  // Resolve timeout
  const timeoutMs = voiceConfig.responseTimeoutMs ?? deps.resolveAgentTimeoutMs({ cfg });
  const runId = `voice:${callId}:${Date.now()}`;

  try {
    const result = await deps.runEmbeddedPiAgent({
      sessionId,
      sessionKey,
      messageProvider: "voice",
      sessionFile,
      workspaceDir,
      config: cfg,
      prompt: decisionPrompt.prompt,
      provider,
      model,
      thinkLevel,
      verboseLevel: "off",
      timeoutMs,
      runId,
      lane: "voice",
      extraSystemPrompt: decisionPrompt.extraSystemPrompt,
      agentDir,
    });

    // Extract text from payloads
    const texts = (result.payloads ?? [])
      .filter((p) => p.text && !p.isError)
      .map((p) => p.text?.trim())
      .filter(Boolean);

    const text = texts.join(" ") || null;

    if (!text && result.meta?.aborted) {
      return { action: "wait", text: null, error: "Response generation was aborted" };
    }

    const decision = text ? parseVoiceResponseDecision(text) : null;
    if (decision) {
      const digits =
        decision.action === "dtmf"
          ? normalizeDtmfSequence(decision.digits ?? "")
          : undefined;
      if (decision.action === "dtmf" && !digits) {
        return {
          action: "wait",
          text: null,
          error: "Structured DTMF response missing valid digits",
          reason: "invalid-dtmf-response",
        };
      }
      return {
        action: decision.action,
        text: sanitizeVoiceSpeech(decision.speech),
        digits,
        reason: decision.reason,
      };
    }

    const unstructuredSpeech =
      text && !/\baction\b/i.test(text) && !/[{}[\]]/.test(text) ? sanitizeVoiceSpeech(text) : null;
    if (unstructuredSpeech) {
      return {
        action: "speak",
        text: unstructuredSpeech,
        reason: "unstructured-fallback",
      };
    }

    return {
      action: "wait",
      text: null,
      error: text ? `Unable to parse structured response: ${text}` : undefined,
      reason: "invalid-structured-response",
    };
  } catch (err) {
    console.error(`[voice-call] Response generation failed:`, err);
    return { action: "wait", text: null, error: String(err) };
  }
}
