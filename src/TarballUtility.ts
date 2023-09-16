import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { mkdirp, requireString, requireValidPath, spawnAsync, trace, whichSync } from './generalUtils.js'

export class TarballUtility {
  private whichSyncFn: typeof whichSync

  constructor(whichSyncFn: typeof whichSync) {
    this.whichSyncFn = whichSyncFn
  }

  /**
   * Creates a gzipped tarball from a directory by spawning a process to run OS-installed `tar` to avoid pulling in npm package dependencies.
   * Note that Windows has tar since Windows 10 1803 (see https://devblogs.microsoft.com/commandline/windows10v1803/.
   * 
   * It's possible this isn't 100% reliable due to differences in `tar` versions across platforms. If better normalization
   * is required, consider using the npm package `node-tar` instead.
   * @param directoryToTarball The directory to tarball. The directory name will be used as the root directory in the tarball
   * @param tarballPath The path to the tarball to create - must end with '.tar.gz'
   * @param excludes An optional array of file and directory name patterns to exclude from the tarball
   */
  createTarball = async (directoryToTarball: string, tarballPath: string, excludes?: string[]) => {
    requireValidPath('directoryToTarball', directoryToTarball)
    requireString('tarballPath', tarballPath)

    if (!this.whichSyncFn('tar').location) {
      throw new Error('tar command not found - please install tar on your OS to use this method, or consider using the npm package node-tar instead')
    }

    if (!fs.existsSync(directoryToTarball)) {
      throw new Error(`directoryToTarball does not exist: ${directoryToTarball}`)
    }

    if (tarballPath.endsWith('.tar.gz') === false) {
      throw new Error(`tarballPath must end with '.tar.gz': ${tarballPath}`)
    }

    const directoryToTarballParentDir = path.dirname(directoryToTarball)
    const directoryToTarballName = path.basename(directoryToTarball)

    const outputDirectory = path.dirname(tarballPath)
    const tarballName = path.basename(tarballPath)

    if (!fs.existsSync(outputDirectory)) {
      trace(`tarballPath directory does not exist - creating '${outputDirectory}'`)
      await mkdirp(outputDirectory)
    } else if (fs.existsSync(tarballPath)) {
      trace(`removing existing tarball '${tarballName}' before creating new one`)
      await fsp.unlink(tarballPath)
    }

    const excludesArgs = excludes ? excludes.map(exclude => `--exclude=${exclude}`) : []
    const args = ['-czf', tarballPath, '-C', directoryToTarballParentDir, ...excludesArgs, directoryToTarballName]

    const result = await spawnAsync('tar', args)

    if (result.code !== 0) {
      throw new Error(`tar command failed with code ${result.code}`)
    }

    trace('tarball created: ' + tarballPath)
  }
}

const defaultUtil = new TarballUtility(whichSync)
export const createTarball = defaultUtil.createTarball
