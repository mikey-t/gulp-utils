import { requireString } from './generalUtils.js'

/**
 * Check if a string is a valid .net target framework moniker that is greater than or equal to "net5.0". Only "netX.Y" (where `X` and `Y` are digits) format is supported, case sensitive.
 * @param targetFrameworkMoniker The target framework moniker string. See https://learn.microsoft.com/en-us/dotnet/standard/frameworks.
 * @returns `true` if `targetFrameworkMoniker` is greater than or equal to "net5.0", `false` otherwise
 */
export function isTargetFrameworkMonikerGreaterThanOrEqualToNet5(targetFrameworkMoniker: string) {
  requireString('targetFrameworkMoniker', targetFrameworkMoniker)
  const netFormatPattern = /^net([5-9]|\d{2,})\.\d+$/
  return netFormatPattern.test(targetFrameworkMoniker)
}
