import assert from 'node:assert'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path, { join } from 'node:path'
import { beforeEach, describe, it } from 'node:test'
import { whichSync, WhichResult, mkdirp, spawnAsync, SpawnResult } from '../src/generalUtils.js'
import { TarballUtility } from '../src/TarballUtility.js'
import { assertErrorMessageStartsWith, ensureEmptyTmpDir, fileExistsAndIsNonZero, fixturesDir, tmpDir } from './testUtils.js'
import { config } from '../src/NodeCliUtilsConfig.js'

config.traceEnabled = false

const tarballTmpDir = path.join(tmpDir, 'tarball-test')
const dirToTarball = join(fixturesDir, 'dirToTarball')
const tarballPath = join(tarballTmpDir, 'test.tar.gz')
const defaultTarballUtility = new TarballUtility()
const unpackedTestDir = path.join(tarballTmpDir, 'unpacked-test')
const fixtureTarball = path.join(fixturesDir, 'test.tar.gz')

function assertDefaultTarballContents(withStripComponentsZero: boolean = false) {
  const firstDirInUnpacked = withStripComponentsZero ? 'dirToTarball' : ''
  const unpackedPaths = [
    path.join(unpackedTestDir, firstDirInUnpacked, 'tarballSubDir'),
    path.join(unpackedTestDir, firstDirInUnpacked, 'test1.txt'),
    path.join(unpackedTestDir, firstDirInUnpacked, 'test2.txt'),
    path.join(unpackedTestDir, firstDirInUnpacked, 'tarballSubDir', 'test3.txt')
  ]
  assertTarballHasPaths(unpackedPaths)
}

function assertTarballHasPaths(paths: string[]) {
  paths.forEach(p => {
    assert.ok(fs.existsSync(p), `file missing in unpacked path: ${p}`)
  })
}

function assertTarballExists(archivePath: string) {
  assert.ok(fileExistsAndIsNonZero(archivePath), `tarball was not created or it's size is 0`)
}

beforeEach(async () => {
  await ensureEmptyTmpDir(tarballTmpDir)
})

describe('createTarball', () => {
  it('has a working happy path', async () => {
    assert.ok(!fs.existsSync(tarballPath))
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath)
    assertTarballExists(tarballPath)
  })

  it('creates the tarball when config.traceEnabled is true', async () => {
    try {
      config.traceEnabled = true
      assert.ok(!fs.existsSync(tarballPath))
      await defaultTarballUtility.createTarball(dirToTarball, tarballPath)
      assertTarballExists(tarballPath)
    } finally {
      config.traceEnabled = false
    }
  })

  it('throws if directoryToTarball does not exist', async () => {
    const nonExistentDir = join(fixturesDir, 'nonExistentDir')
    await assert.rejects(
      defaultTarballUtility.createTarball(nonExistentDir, tarballPath),
      { name: 'Error', message: `Invalid or nonexistent path provided for param 'directoryToTarball': ${nonExistentDir}` }
    )
  })

  it('throws if tarballPath does not end in .tar.gz', async () => {
    const invalidTarballPath = join(tarballTmpDir, 'invalid.tar')
    await assert.rejects(
      defaultTarballUtility.createTarball(dirToTarball, invalidTarballPath),
      err => assertErrorMessageStartsWith(err, `tarballPath must end with '.tar.gz':`))
  })

  it('throws if tar is not installed', async t => {
    const mockResult: WhichResult = { location: undefined, additionalLocations: undefined, error: undefined }
    const whichSyncMock = t.mock.fn(whichSync, () => mockResult)
    const tarballUtility = new TarballUtility({ whichSyncFn: whichSyncMock })
    await assert.rejects(
      tarballUtility.createTarball(dirToTarball, tarballPath),
      { name: 'Error', message: 'tar command not found - please install tar on your OS to use this method, or consider using the npm package node-tar instead' }
    )
  })

  it('creates the output directory if it does\'t exist', async () => {
    const tarballPathTempSubDir = path.join(tarballTmpDir, 'sub-dir', 'test.tar.gz')
    await defaultTarballUtility.createTarball(dirToTarball, tarballPathTempSubDir)
    assertTarballExists(tarballPathTempSubDir)
  })

  it('throws if the tarball already exists', async () => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath)
    await assert.rejects(
      defaultTarballUtility.createTarball(dirToTarball, tarballPath),
      err => assertErrorMessageStartsWith(err, 'tarballPath already exists - delete, move or rename it first:')
    )
  })

  it('creates tarball with excluded file excluded', async () => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath, { excludes: ['test1.txt'] })
    assertTarballExists(tarballPath)
    await defaultTarballUtility.unpackTarballContents(tarballPath, unpackedTestDir)
    const unpackedPaths = [
      path.join(unpackedTestDir, 'test2.txt'),
      path.join(unpackedTestDir, 'tarballSubDir'),
      path.join(unpackedTestDir, 'tarballSubDir', 'test3.txt')
    ]
    assertTarballHasPaths(unpackedPaths)
    assert(!fs.existsSync(path.join(unpackedTestDir, 'test1.txt')), 'test1.txt should not exist in unpacked directory')
  })

  it('creates tarball with excluded file in subdirectory excluded', async () => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath, { excludes: ['test3.txt'] })
    assertTarballExists(tarballPath)
    await defaultTarballUtility.unpackTarballContents(tarballPath, unpackedTestDir)
    const unpackedPaths = [
      path.join(unpackedTestDir, 'test1.txt'),
      path.join(unpackedTestDir, 'test2.txt'),
      path.join(unpackedTestDir, 'tarballSubDir')
    ]
    assertTarballHasPaths(unpackedPaths)
    assert(!fs.existsSync(path.join(unpackedTestDir, 'tarballSubDir', 'test3.txt')), 'test3.txt should not exist in unpacked directory')
  })

  it('creates tarball with multiple excluded files excluded', async () => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath, { excludes: ['test1.txt', 'test3.txt'] })
    assertTarballExists(tarballPath)
    await defaultTarballUtility.unpackTarballContents(tarballPath, unpackedTestDir)
    const unpackedPaths = [
      path.join(unpackedTestDir, 'test2.txt'),
      path.join(unpackedTestDir, 'tarballSubDir')
    ]
    assertTarballHasPaths(unpackedPaths)
    assert(!fs.existsSync(path.join(unpackedTestDir, 'test1.txt')), 'test1.txt should not exist in unpacked directory')
    assert(!fs.existsSync(path.join(unpackedTestDir, 'tarballSubDir', 'test3.txt')), 'tarballSubDir/test3.txt should not exist in unpacked directory')
  })

  it('creates tarball with directory excluded', async () => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath, { excludes: ['tarballSubDir'] })
    assertTarballExists(tarballPath)
    await defaultTarballUtility.unpackTarballContents(tarballPath, unpackedTestDir)
    const unpackedPaths = [
      path.join(unpackedTestDir, 'test1.txt'),
      path.join(unpackedTestDir, 'test2.txt')
    ]
    assertTarballHasPaths(unpackedPaths)
    assert(!fs.existsSync(path.join(unpackedTestDir, 'tarballSubDir')), 'tarballSubDir should not exist in unpacked directory')
    assert(!fs.existsSync(path.join(unpackedTestDir, 'tarballSubDir', 'test3.txt')), 'tarballSubDir/test3.txt should not exist in unpacked directory')
  })

  it('throws when spawnAsync returns non-zero exit code', async t => {
    const mockResult: SpawnResult = { code: 42, stdout: '', stderr: '' }
    const spawnAsyncMock = t.mock.fn(spawnAsync, async () => mockResult)
    const tarballUtility = new TarballUtility({ spawnAsyncFn: spawnAsyncMock })
    await assert.rejects(
      tarballUtility.createTarball(dirToTarball, tarballPath),
      { name: 'Error', message: 'tar command failed with code 42' }
    )
  })
})

describe('unpackTarball', () => {
  it('throws if tarballPath does not exist', async () => {
    const nonExistentTarballPath = join(fixturesDir, 'nonExistentTarball.tar.gz')
    await assert.rejects(
      defaultTarballUtility.unpackTarball(nonExistentTarballPath, unpackedTestDir),
      { name: 'Error', message: `Invalid or nonexistent path provided for param 'tarballPath': ${nonExistentTarballPath}` }
    )
  })

  it('throws if stripComponents is less than 0', async () => {
    await assert.rejects(
      defaultTarballUtility.unpackTarball(fixtureTarball, unpackedTestDir, { stripComponents: -1 }),
      { name: 'Error', message: 'stripComponents must be greater than or equal to 0 if provided' }
    )
  })

  it('strips 0 directories off of tarball when unpacking with stripComponents of 0', async () => {
    await mkdirp(unpackedTestDir)
    await defaultTarballUtility.unpackTarball(fixtureTarball, unpackedTestDir, { stripComponents: 0 })
    assertDefaultTarballContents(true)
  })

  it('strips 1 directory off of tarball when unpacking with stripComponents of 1', async () => {
    await mkdirp(unpackedTestDir)
    await defaultTarballUtility.unpackTarball(fixtureTarball, unpackedTestDir, { stripComponents: 1 })
    assertDefaultTarballContents()
  })

  it('strips 2 directory off of tarball when unpacking with stripComponents of 2', async () => {
    await mkdirp(unpackedTestDir)
    await defaultTarballUtility.unpackTarball(fixtureTarball, unpackedTestDir, { stripComponents: 2 })
    assert.ok(fs.existsSync(path.join(unpackedTestDir, 'test3.txt')), 'there should be exactly one file (test3.txt) in the unpacked directory')
  })

  it('unpacked directory is empty if stripComponents is equal to the max depth of the directoryToTarball', async () => {
    await mkdirp(unpackedTestDir)
    await defaultTarballUtility.unpackTarball(fixtureTarball, unpackedTestDir, { stripComponents: 3 })
    const unpackedTestDirContents = await fsp.readdir(unpackedTestDir)
    assert.ok(unpackedTestDirContents.length === 0, `unpackedTestDir should be empty but it contains ${unpackedTestDirContents.length} files`)
  })

  it('unpacked directory is empty if stripComponents is greater than the max depth of the directoryToTarball', async () => {
    await mkdirp(unpackedTestDir)
    await defaultTarballUtility.unpackTarball(fixtureTarball, unpackedTestDir, { stripComponents: 4 })
    const unpackedTestDirContents = await fsp.readdir(unpackedTestDir)
    assert.ok(unpackedTestDirContents.length === 0, `unpackedTestDir should be empty but it contains ${unpackedTestDirContents.length} files`)
  })

  it('creates the directory if it does\'t exist if that option is passed', async () => {
    await defaultTarballUtility.unpackTarball(fixtureTarball, unpackedTestDir, { createDirIfNotExists: true })
    assertDefaultTarballContents(true)
  })

  it('throws if unpackDirectory does not exist and createDirIfNotExists option is false', async () => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath)
    await assert.rejects(
      defaultTarballUtility.unpackTarball(tarballPath, unpackedTestDir),
      { name: 'Error', message: `unpackDirectory does not exist: ${unpackedTestDir}` }
    )
  })

  it('throws if unpackDirectory already exists and is not empty', async () => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath)
    await mkdirp(unpackedTestDir)
    await fsp.writeFile(path.join(unpackedTestDir, 'dummy.txt'), 'dummy')
    await assert.rejects(
      defaultTarballUtility.unpackTarball(tarballPath, unpackedTestDir),
      { name: 'Error', message: `unpackDirectory exists but is not empty: ${unpackedTestDir}` }
    )
  })

  it('throws if the unpackDirectory exists but is not a directory', async () => {
    const dummyFilePath = path.join(tarballTmpDir, 'dummy.txt')
    await fsp.writeFile(dummyFilePath, 'dummy')
    await assert.rejects(
      defaultTarballUtility.unpackTarball(fixtureTarball, dummyFilePath),
      { name: 'Error', message: `unpackDirectory exists but is not a directory: ${dummyFilePath}` }
    )
  })

  it('throws if isDirectory call returns false because of an exception with fs.statSync', async t => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath)
    await mkdirp(unpackedTestDir)

    const statSyncMock = t.mock.fn(fs.statSync, () => { throw new Error('any error') })
    const tarballUtility = new TarballUtility({ statSyncFn: statSyncMock })

    await assert.rejects(
      tarballUtility.unpackTarball(fixtureTarball, unpackedTestDir, { stripComponents: 1 }),
      err => assertErrorMessageStartsWith(err, 'unpackDirectory exists but is not a directory')
    )
  })

  it('throws if dirIsEmpty throws ', async t => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath)
    await mkdirp(unpackedTestDir)

    const statSyncMock = t.mock.fn(fs.statSync)
    // It gets called more than once, so we're just mocking the error the second time
    statSyncMock.mock.mockImplementationOnce(() => { throw new Error('any error') }, 1)
    const tarballUtility = new TarballUtility({ statSyncFn: statSyncMock })

    await assert.rejects(
      tarballUtility.unpackTarball(tarballPath, unpackedTestDir),
      { name: 'Error', message: 'Error checking dirIsNotEmpty - see innerError' }
    )
  })

  it('throws if tryCreateDirectory throws', async t => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath)

    const mkdirpMock = t.mock.fn(mkdirp, () => { throw new Error('Any error') })
    const tarballUtility = new TarballUtility({ mkdirpFn: mkdirpMock })

    await assert.rejects(
      tarballUtility.unpackTarball(tarballPath, unpackedTestDir, { createDirIfNotExists: true }),
      { name: 'Error', message: 'Error creating unpackDirectory - see innerError' }
    )
  })
})

describe('unpackTarballContents', () => {
  it('calls the unpackTarball method with options to create the directory and stripComponents of 1', async () => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath)
    await defaultTarballUtility.unpackTarballContents(tarballPath, unpackedTestDir)
    assertDefaultTarballContents()
  })

  it('unpacks the tarball when config.traceEnabled is true', async () => {
    try {
      config.traceEnabled = true
      await defaultTarballUtility.createTarball(dirToTarball, tarballPath)
      await defaultTarballUtility.unpackTarballContents(tarballPath, unpackedTestDir)
      assertDefaultTarballContents()
    } finally {
      config.traceEnabled = true
    }
  })

  it('throws if tar command is not found', async t => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath)

    const mockResult: WhichResult = { location: undefined, additionalLocations: undefined, error: undefined }
    const whichSyncMock = t.mock.fn(whichSync, () => mockResult)
    const tarballUtility = new TarballUtility({ whichSyncFn: whichSyncMock })

    await assert.rejects(
      tarballUtility.unpackTarballContents(tarballPath, unpackedTestDir),
      { name: 'Error', message: 'tar command not found - please install tar on your OS to use this method, or consider using the npm package node-tar instead' }
    )
  })

  it('throws when spawnAsync returns non-zero exit code', async t => {
    await defaultTarballUtility.createTarball(dirToTarball, tarballPath)

    const mockResult: SpawnResult = { code: 42, stdout: '', stderr: '' }
    const spawnAsyncMock = t.mock.fn(spawnAsync, async () => mockResult)
    const tarballUtility = new TarballUtility({ spawnAsyncFn: spawnAsyncMock })

    await assert.rejects(
      tarballUtility.unpackTarballContents(tarballPath, unpackedTestDir),
      { name: 'Error', message: 'tar command failed with code 42' }
    )
  })
})
