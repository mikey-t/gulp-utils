import assert from 'node:assert'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path, { join, resolve } from 'node:path'
import { beforeEach, describe, it } from 'node:test'
import { createTarball, findFilesRecursively } from '../src/generalUtils.js'

const fixturesDir = './test/fixtures'
const tmpDir = './test/tmp'
const searchDir = './test/fixtures/search-dir'

const ensureEmptyTmpDir = async () => {
  if (fs.existsSync(tmpDir)) {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  }
  await fsp.mkdir(tmpDir)
}

describe('createTarball', () => {
  beforeEach(async () => {
    await ensureEmptyTmpDir()
  })

  it('happy path', async () => {
    const tarballPath = path.join(tmpDir, 'test.tar.gz')
    await createTarball(path.join(fixturesDir, 'dirToTarball'), tarballPath)
  })
})

describe('findFilesRecursively', () => {
  const BASE_DIR = resolve('./test/fixtures/search-dir')

  it('should match files based on pattern *.test.ts', async () => {
    const matches = await findFilesRecursively(BASE_DIR, '*.test.ts')
    const expectedMatches = [
      join(BASE_DIR, 'first-level.test.ts'),
      join(BASE_DIR, 'dirA/second-levelA.test.ts'),
      join(BASE_DIR, 'dirB/second-levelB.test.ts'),
      join(BASE_DIR, 'dirC/second-levelC.test.ts'),
      join(BASE_DIR, 'dirA/dirAA/third-levelAA.test.ts'),
      join(BASE_DIR, 'dirA/dirAB/third-levelAB.test.ts'),
      join(BASE_DIR, 'dirB/dirBA/third-levelBA.test.ts'),
      join(BASE_DIR, 'dirB/dirBA/dirBAA/fourth-levelBAA.test.ts'),
      join(BASE_DIR, 'dirB/dirBA/dirBAA/dirBAAA/fifth-levelBAAA.test.ts'),
      join(BASE_DIR, 'dirA/dirAA/dirAAA/fourth-levelAAA.test.ts')
    ]

    const sortedExpectedMatches = expectedMatches.sort()
    const sortedActualMatches = matches.sort()

    // Uncomment to troubleshoot
    // const missingInActual = sortedExpectedMatches.filter(item => !sortedActualMatches.includes(item))
    // const extraInActual = sortedActualMatches.filter(item => !sortedExpectedMatches.includes(item))
    // console.log('Missing in actual:', missingInActual)
    // console.log('Extra in actual:', extraInActual)

    assert.deepEqual(sortedActualMatches, sortedExpectedMatches)
  })

  it('should respect maxDepth option', async () => {
    const matches = await findFilesRecursively(searchDir, '*.test.ts', { maxDepth: 3 })
    const expectedMatches = [
      join(BASE_DIR, 'first-level.test.ts'),
      join(BASE_DIR, 'dirA/second-levelA.test.ts'),
      join(BASE_DIR, 'dirB/second-levelB.test.ts'),
      join(BASE_DIR, 'dirC/second-levelC.test.ts'),
      join(BASE_DIR, 'dirA/dirAA/third-levelAA.test.ts'),
      join(BASE_DIR, 'dirA/dirAB/third-levelAB.test.ts'),
      join(BASE_DIR, 'dirB/dirBA/third-levelBA.test.ts')
    ]

    const sortedExpectedMatches = expectedMatches.sort()
    const sortedActualMatches = matches.sort()

    assert.deepEqual(sortedActualMatches, sortedExpectedMatches)
  })

  it('should collapse multiple * characters', async () => {
    const matches = await findFilesRecursively(BASE_DIR, '**.test.ts')
    const expectedMatches = [
      join(BASE_DIR, 'first-level.test.ts'),
      join(BASE_DIR, 'dirA/second-levelA.test.ts'),
      join(BASE_DIR, 'dirB/second-levelB.test.ts'),
      join(BASE_DIR, 'dirC/second-levelC.test.ts'),
      join(BASE_DIR, 'dirA/dirAA/third-levelAA.test.ts'),
      join(BASE_DIR, 'dirA/dirAB/third-levelAB.test.ts'),
      join(BASE_DIR, 'dirB/dirBA/third-levelBA.test.ts'),
      join(BASE_DIR, 'dirB/dirBA/dirBAA/fourth-levelBAA.test.ts'),
      join(BASE_DIR, 'dirB/dirBA/dirBAA/dirBAAA/fifth-levelBAAA.test.ts'),
      join(BASE_DIR, 'dirA/dirAA/dirAAA/fourth-levelAAA.test.ts')
    ]

    const sortedExpectedMatches = expectedMatches.sort()
    const sortedActualMatches = matches.sort()

    assert.deepEqual(sortedActualMatches, sortedExpectedMatches)
  })

  it('respects the excludeDirNames option', async () => {
    const excludeDirNames = ['dirA', 'dirBAA']
    const matches = await findFilesRecursively(searchDir, '*.test.ts', { excludeDirectoryNames: excludeDirNames })
    const expectedMatches = [
      join(BASE_DIR, 'first-level.test.ts'),
      join(BASE_DIR, 'dirB/second-levelB.test.ts'),
      join(BASE_DIR, 'dirC/second-levelC.test.ts'),
      join(BASE_DIR, 'dirB/dirBA/third-levelBA.test.ts')
    ]

    const sortedExpectedMatches = expectedMatches.sort()
    const sortedActualMatches = matches.sort()

    assert.deepEqual(sortedActualMatches, sortedExpectedMatches)
  })

  it('options returnForwardSlashRelativePaths works', async () => {
    const matches = await findFilesRecursively(searchDir, '*.test.ts', { returnForwardSlashRelativePaths: true })
    const expectedMatches = [
      'first-level.test.ts',
      'dirA/second-levelA.test.ts',
      'dirB/second-levelB.test.ts',
      'dirC/second-levelC.test.ts',
      'dirA/dirAA/third-levelAA.test.ts',
      'dirA/dirAB/third-levelAB.test.ts',
      'dirB/dirBA/third-levelBA.test.ts',
      'dirB/dirBA/dirBAA/fourth-levelBAA.test.ts',
      'dirB/dirBA/dirBAA/dirBAAA/fifth-levelBAAA.test.ts',
      'dirA/dirAA/dirAAA/fourth-levelAAA.test.ts'
    ]

    const sortedExpectedMatches = expectedMatches.sort()
    const sortedActualMatches = matches.sort()

    assert.deepEqual(sortedActualMatches, sortedExpectedMatches)
  })

  it('throws if pattern param is more than 50 characters', async () => {
    const pattern = 'a'.repeat(51)
    await assert.rejects(async () => await findFilesRecursively(searchDir, pattern), { name: 'Error', message: 'filenamePattern param must have fewer than 50 characters', })
  })

  it('throws if there are more than 5 wildcard characters in pattern param', async () => {
    const pattern = 'a*'.repeat(6)
    await assert.rejects(async () => await findFilesRecursively(searchDir, pattern), { name: 'Error', message: 'filenamePattern param must contain 5 or fewer wildcards', })
  })

  it('successfully handles cases where the wildcard is the last character in the pattern', async () => {
    const matches = await findFilesRecursively(searchDir, 'second-level*')
    const expectedMatches = [
      join(BASE_DIR, 'dirA/second-levelA.test.ts'),
      join(BASE_DIR, 'dirA/second-levelA.txt'),
      join(BASE_DIR, 'dirB/second-levelB.test.ts'),
      join(BASE_DIR, 'dirB/second-levelB.txt'),
      join(BASE_DIR, 'dirC/second-levelC.js'),
      join(BASE_DIR, 'dirC/second-levelC.test.ts')
    ]

    const sortedExpectedMatches = expectedMatches.sort()
    const sortedActualMatches = matches.sort()

    assert.deepEqual(sortedActualMatches, sortedExpectedMatches)
  })

  it('does not allow forward slashes in the filePattern param', async () => {
    await assert.rejects(async () => await findFilesRecursively(searchDir, 'dirA/second-level*'), { name: 'Error', message: 'filenamePattern param must not contain slashes', })
  })

  it('does not allow back slashes in the filePattern param', async () => {
    await assert.rejects(async () => await findFilesRecursively(searchDir, 'dirA\\second-level*'), { name: 'Error', message: 'filenamePattern param must not contain slashes', })
  })
})
