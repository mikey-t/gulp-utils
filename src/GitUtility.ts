import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { mkdirp, spawnAsync } from './generalUtils.js'
import { join } from 'node:path'

export interface GitUtilityDependencies {
  spawnAsyncFn: typeof spawnAsync
}

class GitUtility {
  private spawnAsyncFn: typeof spawnAsync

  constructor(dependencies: Partial<GitUtilityDependencies> = {}) {
    this.spawnAsyncFn = dependencies.spawnAsyncFn ?? spawnAsync
  }

  isValidBranchName(branchName: string): boolean {
    if (branchName.startsWith('-') || branchName.endsWith('/') || branchName.endsWith('.') || branchName.endsWith('@{') || branchName.includes('..')) {
      return false
    }

    const invalidChars = [' ', '~', '^', ':', '\\', '*', '?', '[', ']', '/']
    for (const char of branchName) {
      if (invalidChars.includes(char)) {
        return false
      }
    }

    return true
  }

  async cloneProject(repoUrl: string, localDestPath: string, branchName: string = 'main', deleteGitFolder: boolean = true) {
    if (fs.existsSync(localDestPath)) {
      throw new Error(`Cannot clone project - destination path already exists: ${localDestPath}`)
    }
    if (!this.isValidBranchName(branchName)) {
      throw new Error(`Cannot clone project - invalid branch name: ${branchName}`)
    }

    await mkdirp(localDestPath)

    const cloneArgs = `clone -b ${branchName} --single-branch --depth 1 ${repoUrl} ${localDestPath}`.split(' ')
    const result = await this.spawnAsyncFn('git', cloneArgs)
    if (result.code !== 0) {
      throw new Error(`Failed to clone project '${result.stderr}' to '${localDestPath}'`)
    }

    if (deleteGitFolder) {
      await fsp.rm(join(localDestPath, '.git'), { recursive: true })
    }
  }
}

const defaultGitUtility = new GitUtility()

export const isValidBranchName = defaultGitUtility.isValidBranchName
export const cloneProject = defaultGitUtility.cloneProject
