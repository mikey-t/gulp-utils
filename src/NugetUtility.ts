import { isTargetFrameworkMonikerGreaterThanOrEqualToNet5 } from './dotnetUtilsInternal.js'
import { findAllIndexes, requireString, trace } from './generalUtils.js'
import { httpGet } from './generalUtilsInternal.js'

export interface NugetUtilityDependencies {
  nugetAccessor: NugetAccessor
}

export class NugetUtility {
  private readonly genericParsingErrorMessage = `Unexpected nuget.org html format (enable trace for more detail): `
  private readonly htmlClassFrameworksTable = 'framework-table-frameworks'
  private readonly htmlClassDirectCompatibility = 'framework-badge-asset'
  private readonly htmlClassComputedCompatibility = 'framework-badge-computed'

  private nugetAccessor: INugetAccessor

  constructor(dependencies: Partial<NugetUtilityDependencies> = {}) {
    this.nugetAccessor = dependencies.nugetAccessor ?? new NugetAccessor()
  }

  static getNugetLandingPageUrl(packageName: string, packageVersion: string): string {
    return `https://www.nuget.org/packages/${packageName}/${packageVersion}`
  }

  static getVersionsJsonUrl(packageName: string) {
    return `https://api.nuget.org/v3-flatcontainer/${packageName}/index.json`.toLowerCase()
  }

  /**
   * Get the newest version number for the nuget package that is compatible with the specified .net version.
   * @param packageName The nuget package name to evaluate.
   * @param targetFrameworkMoniker The .net framework version, for example "net6.0" or "net8.0"
   * @returns A version string for the latest nuget package that is compatible with the specified .net framework, or `null` if there wasn't a compatible version found.
   * @throws If the package does not exist.
   * @throws If the nuget API is unreachable.
   * @throws If the nuget.org package landing page is unreachable or it's html format for compatible .net frameworks changes.
   */
  getLatestNugetPackageVersion = async (packageName: string, targetFrameworkMoniker: string): Promise<string | null> => {
    this.validatePackageName(packageName)
    this.validateFrameworkVersion(targetFrameworkMoniker)

    const allVersionsJson = await this.nugetAccessor.getAllVersionsJson(packageName)
    const allNugetVersions = this.getAllNugetVersionsFromJson(packageName, allVersionsJson)
    const mostRecentMajorVersions = this.getLatestMajorVersions(allNugetVersions)
    const sortedVersions = [...mostRecentMajorVersions].sort((a, b) => b.major - a.major)

    for (const majorVersion of sortedVersions) {
      const landingPageUrl = NugetUtility.getNugetLandingPageUrl(packageName, majorVersion.raw)
      const landingPageHtml = await this.nugetAccessor.getPackageLandingPageHtml(packageName, majorVersion.raw)
      const compatibleFrameworks = this.extractCompatibleFrameworks(landingPageHtml, landingPageUrl)
      if (compatibleFrameworks.some(f => f.targetFrameworkMoniker === targetFrameworkMoniker)) {
        return majorVersion.raw
      }
    }

    return null
  }

  private validatePackageName(packageName: string) {
    requireString('packageName', packageName)
    const validNugetPattern = /^[a-zA-Z0-9_.-]+$/
    if (!validNugetPattern.test(packageName)) {
      throw new Error(`Package name has invalid characters (must consist of only numbers, letters, underscores, dots and dashes): ${packageName}`)
    }
  }

  private validateFrameworkVersion(targetFrameworkMoniker: string) {
    if (!isTargetFrameworkMonikerGreaterThanOrEqualToNet5(targetFrameworkMoniker)) {
      throw new Error(`Invalid targetFrameworkMoniker (currently only supports "net5.0" and above): ${targetFrameworkMoniker}`)
    }
  }

  private extractCompatibleFrameworks(nugetLandingPageHtml: string, urlForErrorMessage: string): NugetFrameworkCompatibility[] {
    const tableIndexes = findAllIndexes(nugetLandingPageHtml, this.htmlClassFrameworksTable)

    if (tableIndexes.length === 0) {
      trace(`no tables with class ${this.htmlClassFrameworksTable}`)
      throw new Error(this.getGenericParsingError(urlForErrorMessage))
    }

    const compatibleFrameworks: NugetFrameworkCompatibility[] = []

    for (const tableStartIndex of tableIndexes) {
      const endIndex = nugetLandingPageHtml.indexOf('</td>', tableStartIndex)
      if (endIndex === -1) {
        trace(`could not find "</td>" in html after tableStartIndex: ${tableStartIndex}`)
        throw new Error(this.getGenericParsingError(urlForErrorMessage))
      }

      const frameworkTableHtml = nugetLandingPageHtml.substring(tableStartIndex, endIndex)
      compatibleFrameworks.push(...this.extractCompatibleFrameworksFromHtmlTableString(frameworkTableHtml, urlForErrorMessage))
    }

    return compatibleFrameworks
  }

  private extractCompatibleFrameworksFromHtmlTableString(htmlTable: string, urlForErrorMessages: string): NugetFrameworkCompatibility[] {
    const lines = htmlTable.replaceAll('\n', '').replaceAll('\r', '').split("<span").map(line => line.trim())

    const compatibleFrameworks: NugetFrameworkCompatibility[] = []

    for (const line of lines) {
      const isDirectCompatibility = line.includes(this.htmlClassDirectCompatibility)
      const isComputedCompatibility = line.includes(this.htmlClassComputedCompatibility)
      if (!isDirectCompatibility && !isComputedCompatibility) {
        continue
      }

      const spanOpeningTagEndBracketIndex = line.indexOf('>')
      if (spanOpeningTagEndBracketIndex === 0) {
        trace(`could not find ">" in html compatibility table on line: ${line}`)
        throw new Error(this.getGenericParsingError(urlForErrorMessages))
      }

      if (spanOpeningTagEndBracketIndex === (line.length - 1)) {
        trace(`the ">" was the last character in the html compatibility table on line: ${line}`)
        throw new Error(this.getGenericParsingError(urlForErrorMessages))
      }

      const endIndex = line.indexOf('<', spanOpeningTagEndBracketIndex)
      if (endIndex === -1) {
        trace(`could not find "<" in html compatibility table on line: ${line}`)
        throw new Error(this.getGenericParsingError(urlForErrorMessages))
      }

      const startIndex = spanOpeningTagEndBracketIndex + 1
      if (startIndex === endIndex) {
        trace(`the span value was empty for line (startIndex === endIndex): ${line}`)
        throw new Error(this.getGenericParsingError(urlForErrorMessages))
      }

      const val = line.substring(startIndex, endIndex).trim()

      if (!val) {
        trace(`the span value was empty for line: ${line}`)
        throw new Error(this.getGenericParsingError(urlForErrorMessages))
      }

      compatibleFrameworks.push({ targetFrameworkMoniker: val, isDirect: isDirectCompatibility })
    }

    return compatibleFrameworks
  }

  private getGenericParsingError(url: string) {
    return `${this.genericParsingErrorMessage}${url}`
  }

  // Does not currently support pre-release versions (they will be ignored)
  private getLatestMajorVersions(versions: NugetVersion[]): NugetVersion[] {
    const dict: { [majorVersion: number]: NugetVersion } = {}

    trace('**************')
    trace(`versions: `, versions)
    trace('**************')

    for (const v of versions) {
      if (v.suffix !== undefined) {
        continue // Skip all pre-release package versions for now
      }
      if (!dict[v.major]) {
        dict[v.major] = v
        continue
      }
      if (v.isMoreRecentThan(dict[v.major])) {
        dict[v.major] = v
      }
    }

    return Object.values(dict)
  }

  private getAllNugetVersionsFromJson(packageName: string, jsonString: string) {
    let parsedJson: { versions: string[] }

    try {
      parsedJson = JSON.parse(jsonString)
    } catch (error) {
      throw new Error('Could not parse Nuget response - invalid JSON string')
    }

    if (!Array.isArray(parsedJson.versions)) {
      throw new Error('Could not parse Nuget response - the versions property is not an array')
    }

    const versionStrings = parsedJson.versions

    return (versionStrings).map(v => new NugetVersion(packageName, v))
  }
}

/**
 * A `false` `isDirect` property denotes computed compatibility.
 */
export interface NugetFrameworkCompatibility {
  isDirect: boolean
  targetFrameworkMoniker: string
}

/**
 * Use this class to convert a package name and version string into an object.
 */
export class NugetVersion {
  packageName: string
  raw: string
  major: number
  minor: number
  patch: number
  suffix: string | undefined

  constructor(packageName: string, version: string) {
    if (version === undefined || typeof version !== 'string' || version.trim() !== version || version === '' || version.includes(' ')) {
      this.throwGenericError()
    }
    if (!packageName || packageName.trim() !== packageName || packageName === '') {
      this.throwGenericError(`invalid package name: ${packageName}`)
    }
    const urlEncodedPackageName = encodeURIComponent(packageName)
    if (urlEncodedPackageName !== packageName) {
      this.throwGenericError(`url encoded package name is does not match the packageName: ${packageName}`)
    }
    this.packageName = urlEncodedPackageName
    this.raw = version
    const firstDashIndex = version.indexOf('-')
    const hasSuffix = firstDashIndex !== -1

    if (hasSuffix) {
      if (firstDashIndex === version.length - 1) {
        this.throwGenericError('ends with dash symbol')
      }
      this.suffix = version.substring(firstDashIndex + 1)
    }

    const versionWithoutSuffix = hasSuffix ? version.substring(0, firstDashIndex) : version
    const parts = versionWithoutSuffix.split('.')
    this.major = this.getNumOrThrow(parts[0])
    this.minor = parts.length > 1 ? this.getNumOrThrow(parts[1]) : 0
    this.patch = parts.length > 2 ? this.getNumOrThrow(parts[2]) : 0
  }

  /**
   * **Important:** no pre-release version support (no suffix evaluation).
   */
  isMoreRecentThan = (otherVersion: NugetVersion) => {
    if (this.suffix !== undefined || otherVersion.suffix !== undefined) {
      throw new Error('No support for pre-release versions')
    }
    if (this.major !== otherVersion.major) {
      return this.major > otherVersion.major
    }
    if (this.minor !== otherVersion.minor) {
      return this.minor > otherVersion.minor
    }
    return this.patch > otherVersion.patch
  }

  private getNumOrThrow = (part: string): number => {
    const parsed = parseInt(part, 10)
    if (isNaN(parsed)) {
      this.throwGenericError(`"${part}" is not a number`)
    }
    return parsed
  }

  private throwGenericError = (reason?: string) => {
    const reasonPart = reason ? ` (${reason})` : ''
    throw new Error(`Invalid nuget version string${reasonPart}: ${this.raw}`)
  }
}

export interface INugetAccessor {
  getAllVersionsJson(packageName: string): Promise<string>
  getPackageLandingPageHtml(packageName: string, packageVersion: string): Promise<string>
  getNuspec(packageName: string, versionString: string): Promise<string>
}

// Important: at one point the API calls were working with PascalCase package ids, but it seems to have been changed to require all lowercase package ids now
export class NugetAccessor implements INugetAccessor {
  // Template URL: https://api.nuget.org/v3-flatcontainer/{package_id}/index.json
  // Example for EF package: https://api.nuget.org/v3-flatcontainer/microsoft.entityframeworkcore.design/index.json
  getAllVersionsJson = async (packageName: string): Promise<string> => {
    const nugetVersionsUrl = NugetUtility.getVersionsJsonUrl(packageName)
    trace(`getting all package versions json from url: ${nugetVersionsUrl}`)
    const response = await httpGet(nugetVersionsUrl)
    if (!response.ok) {
      throw new Error(`HTTP error code attempting to retrieve all package versions: ${response.status}`)
    }
    return response.body
  }

  // The code to calculate computed framework compatibility is quite complicated and there isn't an API endpoint. Instead of writing an entire app that
  // pulls in the NuGet.Client SDK, I'm just going to grab the html from the nuget.org landing page for the package. For reference, here is the code that computes
  // this for the nuget.org site: https://github.com/NuGet/NuGetGallery/blob/e6a38a882007374b320420645f63cc30f2a93e4d/src/NuGetGallery.Core/Services/AssetFrameworkHelper.cs
  async getPackageLandingPageHtml(packageName: string, packageVersion: string): Promise<string> {
    const nugetPackageUrl = NugetUtility.getNugetLandingPageUrl(packageName, packageVersion)
    trace(`getting nuget.org landing page html from url: ${nugetPackageUrl}`)
    const response = await httpGet(nugetPackageUrl)
    if (!response.ok) {
      throw new Error(`HTTP error code for accessing ${nugetPackageUrl}: ${response.status}`)
    }
    return response.body
  }

  // Template URL: https://api.nuget.org/v3-flatcontainer/{package_id}/{version}/{package_id}.nuspec
  // Example for EF package version 7.0.14: https://api.nuget.org/v3-flatcontainer/microsoft.entityframeworkcore.design/7.0.14/microsoft.entityframeworkcore.design.nuspec
  async getNuspec(packageName: string, versionString: string): Promise<string> {
    const nugetNuspecUrl = `https://api.nuget.org/v3-flatcontainer/${packageName}/${versionString}/${packageName}.nuspec`.toLocaleLowerCase()
    trace(`getting nuspec file from url: ${nugetNuspecUrl}`)
    const response = await httpGet(nugetNuspecUrl)
    if (!response.ok) {
      throw new Error(`HTTP error code attempting to get package nuspec for package "${packageName}" version "${versionString}": ${response.status}`)
    }
    return response.body
  }
}

const defaultNugetUtility = new NugetUtility()

export const getLatestNugetPackageVersion = defaultNugetUtility.getLatestNugetPackageVersion
