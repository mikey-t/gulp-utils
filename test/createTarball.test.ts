import assert from 'node:assert'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path, { join, resolve } from 'node:path'
import { beforeEach, describe, it } from 'node:test'
import { createTarball, findFilesRecursively } from '../src/generalUtils.js'

const fixturesDir = './test/fixtures'
const tmpDir = './test/tmp'

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
