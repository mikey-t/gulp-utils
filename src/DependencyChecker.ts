import chalk from 'chalk'
import * as net from 'net'
import { spawnSync } from 'node:child_process'
import { platform as rawPlatformString } from 'node:process'
import { isDockerRunning } from './dockerUtils.js'
import { isPlatformLinux, isPlatformMac, isPlatformWindows, simpleSpawnAsync, spawnAsync, trace, which, whichSync } from './generalUtils.js'

export type PlatformCode = 'win' | 'linux' | 'mac'
export type StringBoolEntry = { key: string, value: boolean }
export type StringBoolArray = StringBoolEntry[]

export abstract class DependencyChecker {
  protected platformCode: PlatformCode

  constructor() {
    this.platformCode = this.getPlatform()
  }

  abstract getReport(): Promise<StringBoolArray>

  hasAllDependencies(dependenciesReport: StringBoolArray): boolean {
    if (dependenciesReport === null) {
      return false
    }
    return dependenciesReport.every(entry => entry.value)
  }

  getFormattedReport(report: StringBoolArray, includePlatform?: boolean, omitKeys?: string[]): string {
    const platformKey = 'Platform'

    const filteredReport: StringBoolArray = omitKeys && omitKeys.length > 0 ?
      report.filter(entry => !omitKeys.includes(entry.key)) :
      report

    const longestKeyLength = Math.max(
      ...filteredReport.map(entry => entry.key.length),
      platformKey.length
    )

    let reportString = '\n'

    if (includePlatform) {
      reportString += `${platformKey}${' '.repeat(longestKeyLength - platformKey.length)}: ${this.platformCode}\n`
    }

    for (const { key, value } of filteredReport) {
      const padding = ' '.repeat(longestKeyLength - key.length)
      reportString += `${key}${padding}: ${value ? chalk.green('true') : chalk.red('false')}\n`
    }

    return reportString
  }

  protected async hasElevatedPermissions(): Promise<boolean> {
    if (this.platformCode === 'win') {
      return await this.winHasElevatedPerms()
    } else if (this.platformCode === 'linux') {
      return await this.linuxHasElevatedPerms()
    } else if (this.platformCode === 'mac') {
      return await this.linuxHasElevatedPerms()
    }

    return false
  }

  protected async winHasElevatedPerms(): Promise<boolean> {
    try {
      await spawnAsync('net', ['session'], { throwOnNonZero: true, stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  protected async linuxHasElevatedPerms(): Promise<boolean> {
    if (!process.getuid) {
      throw new Error('Cannot determine if linux user has elevated permissions (process.getuid is undefined)')
    }
    const uid = process.getuid()
    return uid === 0
  }

  protected async hasGit(): Promise<boolean> {
    return !!whichSync('git').location
  }

  protected async hasDotnetSdkGreaterThanOrEqualTo(minimumMajorVersion: number): Promise<boolean> {
    return await hasDotnetSdkGreaterThanOrEqualTo(minimumMajorVersion)
  }

  protected async hasNodejsGreaterThanOrEqualTo(minimumMajorVersion: number): Promise<boolean> {
    if (!whichSync('node').location) {
      return false
    }

    const childProc = spawnSync('node', ['-v'], { encoding: 'utf-8' })
    if (childProc.error) {
      return false
    }

    const output = childProc.stdout
    if (!output || output.length === 0) {
      return false
    }

    if (!output.startsWith('v')) {
      throw Error('unexpected output for node -v')
    }

    let foundMajorVersion: number
    try {
      foundMajorVersion = parseInt(output.substring(1, output.indexOf('.')))
    } catch {
      throw Error('error parsing node version')
    }

    return foundMajorVersion >= minimumMajorVersion
  }

  protected async hasDocker(): Promise<boolean> {
    return !!whichSync('docker')
  }

  protected async dockerIsRunning() {
    return await isDockerRunning()
  }

  protected async hasOpenssl(): Promise<boolean> {
    if (this.platformCode === 'mac') {
      const childProc = spawnSync('brew', ['--prefix', 'openssl'], { encoding: 'utf-8' })
      if (childProc.error) {
        return false
      }

      const output = childProc.stdout

      if (!output || output.length === 0) {
        return false
      }

      return !output.toLowerCase().startsWith('error')
    }

    return !!whichSync('openssl').location
  }

  protected async isPortAvailableByEnvKey(envKey: string): Promise<boolean> {
    const errorBase = `Cannot lookup port availability for env key ${envKey}`
    const envVal = process.env[envKey]
    if (!envVal) {
      throw new Error(errorBase + ' - env value not found')
    }
    const port = parseInt(envVal)
    if (isNaN(port)) {
      throw new Error(errorBase + ' - env value could not be parsed into an integer')
    }

    return await this.isPortAvailable(port)
  }

  protected async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = net.connect(port, '127.0.0.1')

      tester.on('connect', () => {
        tester.destroy()
        resolve(false) // port is in use
      })

      tester.on('error', (err: NodeJS.ErrnoException) => {
        tester.destroy()
        if (err.code === 'ECONNREFUSED') {
          resolve(true) // port is available
        } else {
          resolve(false) // some other error occurred, assume port is in use
        }
      })
    })
  }

  private getPlatform(): PlatformCode {

    if (isPlatformWindows()) {
      return 'win'
    } else if (isPlatformMac()) {
      return 'mac'
    } else if (isPlatformLinux()) {
      return 'linux'
    } else {
      throw Error(`Platform not supported: ${rawPlatformString}. Nodejs process.platform must be win32, darwin or linux.`)
    }
  }
}

export async function hasDotnetSdkGreaterThanOrEqualTo(minimumMajorVersion: number): Promise<boolean> {
  if (!(await which('dotnet')).location) {
    return false
  }

  const result = await simpleSpawnAsync('dotnet', ['--list-sdks'], false)
  if (result.code !== 0) {
    trace(result)
    throw new Error('Command "dotnet --list-sdks" returned a non-zero result - enable trace for error details')
  }

  if (result.stdoutLines.length === 0) {
    throw new Error('Unexpected error running "dotnet --list-sdks" and parsing the result - empty stdout lines')
  }

  let latestMajorVersion: number
  const lastLine = result.stdoutLines[result.stdoutLines.length - 1]
  try {
    latestMajorVersion = parseInt(lastLine.substring(0, lastLine.indexOf('.')))
  } catch {
    throw Error('error parsing results of dotnet --list-sdks')
  }

  trace(`minimumMajorVersion: ${minimumMajorVersion} | latestMajorVersion: ${latestMajorVersion}`)
  return latestMajorVersion >= minimumMajorVersion
}
