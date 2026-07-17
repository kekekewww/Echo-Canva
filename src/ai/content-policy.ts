/**
 * Model output is rendered as text, but it is also rejected when it resembles
 * a link, markup, executable protocol, or an instruction. This keeps the
 * control plane from accepting untrusted prose as application content.
 */
const UNSAFE_MODEL_TEXT =
  /(?:\b(?:https?|ftp):\/\/|\bwww\.|(?:^|[^\w/])\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?=$|[\s/?#.,;:!])|\bmailto:[^\s@]+@[^\s@]+|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z]{2,}(?=$|[\s/?#.,;:!])|\b(?:javascript|data|file|vbscript):|<[^>]*>|\[[^\]]*\]\([^)]*\)|\bignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?\b|\b(?:system|developer)\s+(?:message|instruction)s?\b|\bfollow\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)\b|\bdisregard\s+(?:all\s+)?(?:safety|system|developer)\s+(?:rules?|instructions?)\b)/i;

const SAFE_LABEL = /^[\p{L}\p{N}][\p{L}\p{N} &'(),._-]*$/u;

export function isSafeModelText(value: string): boolean {
  return value.trim().length > 0 && !UNSAFE_MODEL_TEXT.test(value) && !/[\u0000-\u001f\u007f]/.test(value);
}

export function isSafeModelLabel(value: string): boolean {
  return isSafeModelText(value) && SAFE_LABEL.test(value);
}
