/**
 * Outbound message redaction — scans outgoing messages for tokens, keys,
 * passwords, and other credentials before they reach external channels.
 *
 * Extends the existing logging/redact.ts patterns with additional patterns
 * for outbound message security.
 */

import { createRequire } from "node:module";
import type { OpenClawConfig } from "../config/config.js";
import { getDefaultRedactPatterns, redactSensitiveText } from "../logging/redact.js";

const requireConfig = createRequire(import.meta.url);

export type RedactOutboundMode = "off" | "messages";

const DEFAULT_OUTBOUND_MODE: RedactOutboundMode = "messages";

/**
 * Additional patterns for outbound redaction beyond what logging/redact.ts provides.
 * These cover cloud credentials, payment tokens, database URIs, and other
 * secrets that may appear in agent-generated messages.
 */
export const OUTBOUND_EXTRA_PATTERNS: string[] = [
  // AWS access keys.
  String.raw`\b(AKIA[0-9A-Z]{16})\b`,
  // AWS secret keys (context-dependent).
  String.raw`(?:aws_secret_access_key|SecretAccessKey|secret_key)\s*[=:"]\s*["']?([A-Za-z0-9/+=]{40})["']?`,
  // Stripe keys.
  String.raw`\b([sr]k_(?:live|test)_[A-Za-z0-9]{20,})\b`,
  String.raw`\b(rk_(?:live|test)_[A-Za-z0-9]{20,})\b`,
  // SendGrid keys.
  String.raw`\b(SG\.[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{22,})\b`,
  // Database connection strings with credentials.
  String.raw`((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp)://[^\s@]+:[^\s@]+@[^\s]+)`,
  // JWT tokens (three base64url segments).
  String.raw`\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b`,
  // Discord bot tokens (format: base64.base64.base64).
  String.raw`\b([MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,})\b`,
  // DigitalOcean tokens.
  String.raw`\b(dop_v1_[a-f0-9]{64})\b`,
  String.raw`\b(doo_v1_[a-f0-9]{64})\b`,
  // Vercel tokens.
  String.raw`\b(vercel_[A-Za-z0-9]{24,})\b`,
  // Supabase keys.
  String.raw`\b(sbp_[a-f0-9]{40})\b`,
  // Twilio keys.
  String.raw`\b(SK[0-9a-fA-F]{32})\b`,
  // Azure keys (context-dependent).
  String.raw`(?:AccountKey|SharedAccessKey)\s*=\s*([A-Za-z0-9+/]{44}={0,2})`,
  // Extra JSON sensitive fields not in the default set.
  String.raw`"(?:api_key|access_key|secret_key|private_key|client_secret|connection_string|database_url|db_password|smtp_password|ssh_key|master_key|service_key|signing_key|encryption_key)"\s*:\s*"([^"]+)"`,
];

type OutboundRedactOptions = {
  mode?: RedactOutboundMode;
  customPatterns?: string[];
};

function resolveOutboundConfig(): OutboundRedactOptions {
  let cfg: OpenClawConfig["logging"] | undefined;
  try {
    const loaded = requireConfig("../config/config.js") as {
      loadConfig?: () => OpenClawConfig;
    };
    cfg = loaded.loadConfig?.().logging;
  } catch {
    cfg = undefined;
  }

  // If the master redact switch is off, outbound is also off.
  if (cfg?.redactSensitive === "off") {
    return { mode: "off" };
  }

  const mode: RedactOutboundMode =
    cfg?.redactOutbound === "off" ? "off" : DEFAULT_OUTBOUND_MODE;

  return { mode, customPatterns: cfg?.redactPatterns };
}

export type RedactOutboundResult = {
  text: string;
  redacted: boolean;
  count: number;
};

/**
 * Redact secrets from an outbound message.
 *
 * Combines default logging patterns + outbound-specific patterns + any
 * user-configured custom patterns.
 *
 * Returns the redacted text along with metadata about what was found.
 */
export function redactOutboundMessage(
  text: string,
  options?: OutboundRedactOptions,
): RedactOutboundResult {
  if (!text) {
    return { text, redacted: false, count: 0 };
  }

  const resolved = options ?? resolveOutboundConfig();
  if (resolved.mode === "off") {
    return { text, redacted: false, count: 0 };
  }

  // Combine all pattern sources: default logging + outbound extras + custom.
  const allPatterns = [
    ...getDefaultRedactPatterns(),
    ...OUTBOUND_EXTRA_PATTERNS,
    ...(resolved.customPatterns ?? []),
  ];

  // Apply redaction using the existing infrastructure.
  const redacted = redactSensitiveText(text, {
    mode: "tools", // Force active (we already checked our own mode above).
    patterns: allPatterns,
  });

  if (redacted === text) {
    return { text, redacted: false, count: 0 };
  }

  // Count how many redactions occurred by diffing the masked tokens.
  // Each mask produces either "***" or "prefix…suffix", count those.
  const maskRe = /\*\*\*|[^\s"']{1,6}…[^\s"']{1,4}/g;
  const originalMasks = text.match(maskRe)?.length ?? 0;
  const redactedMasks = redacted.match(maskRe)?.length ?? 0;
  const count = Math.max(1, redactedMasks - originalMasks);

  return { text: redacted, redacted: true, count };
}

/**
 * Get the combined pattern list for testing/inspection.
 */
export function getOutboundRedactPatterns(): string[] {
  return [...getDefaultRedactPatterns(), ...OUTBOUND_EXTRA_PATTERNS];
}
