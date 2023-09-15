import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createTarball, findFilesRecursively } from '../src/generalUtils.js'
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { join, resolve } from 'node:path'

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
  const BASE_DIR = resolve("./test/fixtures/search-dir")

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
    // console.log("Missing in actual:", missingInActual)
    // console.log("Extra in actual:", extraInActual)

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
    const matches = await findFilesRecursively(searchDir, '*.test.ts', { excludeDirNames })
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
})
