const SENSITIVE_KEY_PATTERN = /(?:token|api[_-]?key|secret|password|credential|authorization|cookie)/i

export const REDACTED_VALUE = '••••••••'

export function isSensitiveConfigKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key)
}

export function redactConfigValue(key: string, value: unknown): unknown {
  if (!isSensitiveConfigKey(key)) return value
  return value === '' || value === null || value === undefined ? value : REDACTED_VALUE
}

export function redactConfigRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (isSensitiveConfigKey(key)) return [key, redactConfigValue(key, value)]
      if (Array.isArray(value)) {
        return [key, value.map((item) => (
          item && typeof item === 'object' && !Array.isArray(item)
            ? redactConfigRecord(item as Record<string, unknown>)
            : item
        ))]
      }
      if (value && typeof value === 'object') {
        return [key, redactConfigRecord(value as Record<string, unknown>)]
      }
      return [key, value]
    }),
  )
}

export function formatRedactedEntries(record: Record<string, string>): string[] {
  return Object.entries(record).map(([key, value]) => (
    `${key}=${String(redactConfigValue(key, value))}`
  ))
}
