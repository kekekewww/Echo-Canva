/**
 * Model output is rendered as text, but it is also rejected when it resembles
 * a link, markup, executable protocol, or an instruction. This keeps the
 * control plane from accepting untrusted prose as application content.
 */
const UNSAFE_MODEL_TEXT =
  /(?:\b(?:https?|ftp):\/\/|\bwww\.|\b(?:javascript|data|file|vbscript):|<[^>]*>|\[[^\]]*\]\([^)]*\)|\bignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?\b|\b(?:system|developer)\s+(?:message|instruction)s?\b)/i;

const SAFE_LABEL = /^[\p{L}\p{N}][\p{L}\p{N} &'(),._-]*$/u;

export function isSafeModelText(value: string): boolean {
  return value.trim().length > 0 && !UNSAFE_MODEL_TEXT.test(value) && !/[\u0000-\u001f\u007f]/.test(value);
}

export function isSafeModelLabel(value: string): boolean {
  return isSafeModelText(value) && SAFE_LABEL.test(value);
}
