/**
 * Parse a dotnet related version string into an object. The string should follow the general format `<major>.<minor>.<patch>[-<suffix>]`.
 */
export class DotnetVersion {
  full: string
  major: number
  minor: number
  patch: number
  suffix?: string

  constructor(version: string) {
    if (version === undefined || typeof version !== 'string' || version.trim() !== version || version === '' || version.includes(' ')) {
      this.throwParsingError()
    }
    this.full = version
    const firstDashIndex = version.indexOf('-')
    const hasSuffix = firstDashIndex !== -1

    if (hasSuffix) {
      if (firstDashIndex === version.length - 1) {
        this.throwParsingError('ends with dash symbol')
      }
      this.suffix = version.substring(firstDashIndex + 1)
    }

    const versionWithoutSuffix = hasSuffix ? version.substring(0, firstDashIndex) : version
    const parts = versionWithoutSuffix.split('.')
    this.major = this.getNumOrThrow(parts[0])
    this.minor = parts.length > 1 ? this.getNumOrThrow(parts[1]) : 0
    this.patch = parts.length > 2 ? this.getNumOrThrow(parts[2]) : 0
  }

  private getNumOrThrow = (part: string): number => {
    const parsed = parseInt(part, 10)
    if (isNaN(parsed)) {
      this.throwParsingError(`"${part}" is not a number`)
    }
    return parsed
  }

  private throwParsingError = (reason?: string) => {
    const reasonPart = reason ? ` (${reason})` : ''
    throw new Error(`Invalid dotnet version string${reasonPart}: ${this.full}`)
  }
}
