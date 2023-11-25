import fs from 'node:fs'
import path from 'node:path'
import { ExtendedError, mkdirp, requireString, requireValidPath, spawnAsync, trace, whichSync } from './generalUtils.js'
import { config } from './NodeCliUtilsConfig.js'

export interface CreateTarballOptions {
  /**
   * A list of files or directories to exclude from the tarball.
   * The paths should be relative to the directoryToTarball.
   */
  excludes?: string[]
}

export interface TarballUnpackOptions {
  createDirIfNotExists: boolean
  stripComponents: number
  throwOnNonEmptyUnpackDir: boolean
}

export interface TarballUtilityDependencies {
  whichSyncFn: typeof whichSync
  spawnAsyncFn: typeof spawnAsync
  statSyncFn: typeof fs.statSync
  mkdirpFn: typeof mkdirp
}

/**
 * This utility class accepts dependencies in constructor params in order to allow mocking of functions like `which` in unit tests without resorting to hacking the import system.
 */
export class TarballUtility {
  private whichSyncFn: typeof whichSync
  private spawnAsyncFn: typeof spawnAsync
  private statSyncFn: typeof fs.statSync
  private mkdirpFn: typeof mkdirp

  constructor(dependencies: Partial<TarballUtilityDependencies> = {}) {
    this.whichSyncFn = dependencies.whichSyncFn ?? whichSync
    this.spawnAsyncFn = dependencies.spawnAsyncFn ?? spawnAsync
    this.statSyncFn = dependencies.statSyncFn ?? fs.statSync
    this.mkdirpFn = dependencies.mkdirpFn ?? mkdirp
  }

  /**
   * Creates a gzipped tarball from a directory by spawning a process to run OS-installed `tar` to avoid pulling in npm package dependencies.
   * Note that Windows has tar since Windows 10 1803 (see https://devblogs.microsoft.com/commandline/windows10v1803/.
   * 
   * It's possible this isn't 100% reliable due to differences in `tar` versions across platforms. If better normalization
   * is required, consider using the npm package `node-tar` instead.
   * @param directoryToTarball The directory to tarball. The directory name will be used as the root directory in the tarball
   * @param tarballPath The path to the tarball to create - must end with '.tar.gz'
   * @param options See {@link CreateTarballOptions}
   */
  createTarball = async (directoryToTarball: string, tarballPath: string, options?: CreateTarballOptions) => {
    requireValidPath('directoryToTarball', directoryToTarball)
    requireString('tarballPath', tarballPath)

    const defaultOptions = { excludes: [] }
    const mergedOptions = { ...defaultOptions, ...options }

    if (!this.whichSyncFn('tar').location) {
      throw new Error('tar command not found - please install tar on your OS to use this method, or consider using the npm package node-tar instead')
    }

    if (tarballPath.endsWith('.tar.gz') === false) {
      throw new Error(`tarballPath must end with '.tar.gz': ${tarballPath}`)
    }

    const directoryToTarballParentDir = path.dirname(directoryToTarball)
    const directoryToTarballName = path.basename(directoryToTarball)

    const outputDirectory = path.dirname(tarballPath)

    if (!fs.existsSync(outputDirectory)) {
      trace(`tarballPath directory does not exist - creating '${outputDirectory}'`)
      await this.mkdirpFn(outputDirectory)
    } else if (fs.existsSync(tarballPath)) {
      throw new Error(`tarballPath already exists - delete, move or rename it first: ${tarballPath}`)
    }

    const excludesArgs = mergedOptions.excludes.length > 0 ? mergedOptions.excludes.map(exclude => `--exclude=${exclude}`) : []
    const verboseFlag = config.traceEnabled ? ['-v'] : []
    const args = [...(verboseFlag), '-czf', tarballPath, '-C', directoryToTarballParentDir, ...excludesArgs, directoryToTarballName]

    const result = await this.spawnAsyncFn('tar', args)

    if (result.code !== 0) {
      throw new Error(`tar command failed with code ${result.code}`)
    }

    trace('tarball created: ' + tarballPath)
  }

  /**
   * Unpacks a gzipped tarball by spawning a process to run OS-installed `tar` to avoid pulling in npm package dependencies.
   * This method will throw an error if the unpackDirectory is not empty, unless the `throwOnNonEmptyUnpackDir` option is set to false.
   * @param tarballPath The path to the tarball to unpack
   * @param unpackDirectory The directory to unpack the tarball into
   * @param options The options to use when unpacking the tarball. See {@link TarballUnpackOptions}.
   */
  unpackTarball = async (tarballPath: string, unpackDirectory: string, options?: Partial<TarballUnpackOptions>) => {
    requireValidPath('tarballPath', tarballPath)
    requireString('unpackDirectory', unpackDirectory)

    if (!this.whichSyncFn('tar').location) {
      throw new Error('tar command not found - please install tar on your OS to use this method, or consider using the npm package node-tar instead')
    }

    const defaultOptions = { createDirIfNotExists: false, stripComponents: 0, throwOnNonEmptyUnpackDir: true }
    const mergedOptions = { ...defaultOptions, ...options }

    if (mergedOptions.stripComponents < 0) {
      throw new Error('stripComponents must be greater than or equal to 0 if provided')
    }

    const unpackedDirExists = fs.existsSync(unpackDirectory)

    if (unpackedDirExists && !this.isDirectory(unpackDirectory)) {
      throw new Error(`unpackDirectory exists but is not a directory: ${unpackDirectory}`)
    }

    if (mergedOptions.createDirIfNotExists && !unpackedDirExists) {
      await this.tryCreateDirectory(unpackDirectory)
    }

    if (!mergedOptions.createDirIfNotExists && !unpackedDirExists) {
      throw new Error(`unpackDirectory does not exist: ${unpackDirectory}`)
    }

    if (mergedOptions.throwOnNonEmptyUnpackDir && this.dirIsNotEmpty(unpackDirectory)) {
      throw new Error(`unpackDirectory exists but is not empty: ${unpackDirectory}`)
    }

    const verboseFlag = config.traceEnabled ? ['-v'] : []
    const args = [...(verboseFlag), '-xzf', tarballPath, '-C', unpackDirectory, '--strip-components', mergedOptions.stripComponents.toString()]
    const result = await this.spawnAsyncFn('tar', args)

    if (result.code !== 0) {
      throw new Error(`tar command failed with code ${result.code}`)
    }

    trace(`tarball unpacked at ${unpackDirectory}`)
  }

  /**
   * A more opinionated version of {@link unpackTarball} that assumes you want to create the directory and strip the first directory out of the unpacked files.
   * @param tarballPath The path to the tarball to unpack
   * @param unpackDirectory The directory to unpack the tarball into - will be created if it doesn't exist and will throw if it exists but is not empty
   * @param stripComponents The number of leading directories to strip out of the unpacked files, defaults to 1
   */
  unpackTarballContents = async (tarballPath: string, unpackDirectory: string, stripComponents: number = 1) => {
    await this.unpackTarball(tarballPath, unpackDirectory, { stripComponents, createDirIfNotExists: true })
  }

  private isDirectory = (path: string): boolean => {
    try {
      const stats = this.statSyncFn(path)
      return stats.isDirectory()
    } catch (err) {
      trace('error checking idDirectory (returning false)', err)
      return false
    }
  }

  private dirIsNotEmpty = (dirPath: string): boolean => {
    try {
      const stats = this.statSyncFn(dirPath)
      return stats.isDirectory() && fs.readdirSync(dirPath).length > 0
    } catch (err) {
      throw new ExtendedError('Error checking dirIsNotEmpty - see innerError', err as Error)
    }
  }

  private tryCreateDirectory = async (dirPath: string) => {
    try {
      await this.mkdirpFn(dirPath)
    } catch (err) {
      throw new ExtendedError('Error creating unpackDirectory - see innerError', err as Error)
    }
  }
}

const defaultUtil = new TarballUtility()

export const createTarball = defaultUtil.createTarball
export const unpackTarball = defaultUtil.unpackTarball
export const unpackTarballContents = defaultUtil.unpackTarballContents
