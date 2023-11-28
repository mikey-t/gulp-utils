import { DotnetVersion } from './DotnetVersion.js'
import { simpleSpawnAsync, trace, which } from './generalUtils.js'

export interface DotnetSdkUtilDependencies {
  whichFn: typeof which
  simpleSpawnAsyncFn: typeof simpleSpawnAsync
}

export class DotnetSdkUtility {
  private readonly whichFn: typeof which
  private readonly simpleSpawnAsyncFn: typeof simpleSpawnAsync

  constructor(dependencies?: Partial<DotnetSdkUtilDependencies>) {
    this.whichFn = dependencies?.whichFn ?? which
    this.simpleSpawnAsyncFn = dependencies?.simpleSpawnAsyncFn ?? simpleSpawnAsync
  }

  getInstalledSdkVersions = async (): Promise<DotnetVersion[]> => {
    if (!(await this.whichFn('dotnet')).location) {
      return []
    }

    const command = 'dotnet'
    const arg = '--list-sdks'
    const fullCommand = `${command} ${arg}`

    const result = await this.simpleSpawnAsyncFn(command, [arg], { throwOnNonZero: false })

    if (result.code !== 0) {
      throw new Error(`Command "${fullCommand}" returned a non-zero result: ${JSON.stringify(result)}`)
    }

    const versions: DotnetVersion[] = []

    for (const line of result.stdoutLines) {
      if (line.trim() === '') {
        continue
      }
      const versionString = line.split(' ')[0].trim()
      let versionObj: DotnetVersion
      try {
        versionObj = new DotnetVersion(versionString)
      } catch (err) {
        trace(`error parsing version string - skipping: ${versionString}`, err)
        continue
      }
      versions.push(versionObj)
    }

    return versions
  }

  isSdkMajorVersionInstalled = async (majorVersion: number): Promise<boolean> => {
    const installedVersions = await this.getInstalledSdkVersions()
    return installedVersions.some(v => v.major === majorVersion)
  }

  isSdkMajorVersionOrGreaterInstalled = async (majorVersion: number): Promise<boolean> => {
    const installedVersions = await this.getInstalledSdkVersions()
    const sortedVersions = [...installedVersions].sort((a, b) => b.major - a.major)
    return sortedVersions.length > 0 && sortedVersions[0].major >= majorVersion
  }
}

const defaultDotnetSdkUtility = new DotnetSdkUtility()

export const getInstalledSdkVersions = defaultDotnetSdkUtility.getInstalledSdkVersions
export const isSdkMajorVersionInstalled = defaultDotnetSdkUtility.isSdkMajorVersionInstalled
export const isSdkMajorVersionOrGreaterInstalled = defaultDotnetSdkUtility.isSdkMajorVersionOrGreaterInstalled
