import assert from 'node:assert'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path, { join, resolve } from 'node:path'
import { beforeEach, describe, it } from 'node:test'
import { findFilesRecursively, whichSync, WhichResult } from '../src/generalUtils.js'
import { TarballUtility } from '../src/TarballUtility.js'

const fixturesDir = './test/fixtures'
const tmpDir = './test/tmp'
const dirToTarball = join(fixturesDir, 'dirToTarball')
const tarballPath = join(tmpDir, 'test.tar.gz')
const defaultTarballUtility = new TarballUtility(whichSync)

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
    assert.ok(!fs.existsSync(tarballPath))
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath)
    assert.ok(fs.existsSync(tarballPath))
  })

  it('throws if directoryToTarball does not exist', async () => {
    const tarballPath = join(tmpDir, 'test.tar.gz')
    const nonExistentDir = join(fixturesDir, 'nonExistentDir')
    await assert.rejects(async () => {
      await defaultTarballUtility.createTarball(nonExistentDir, tarballPath)
    }, { name: 'Error', message: `Invalid or nonexistent path provided for param 'directoryToTarball': ${nonExistentDir}` })
  })

  it('throws if tar is not installed', async t => {
    const mockWhichResult: WhichResult = { location: undefined, additionalLocations: undefined, error: undefined }
    const mockWhichSync = t.mock.fn(whichSync, () => {
      return mockWhichResult
    })
    const tarballUtility = new TarballUtility(mockWhichSync)
    assert.rejects(async () => {
      await tarballUtility.createTarball(dirToTarball, tarballPath)
    }, { name: 'Error', message: 'tar command not found - please install tar on your OS to use this method, or consider using the npm package node-tar instead' })
  })
})
