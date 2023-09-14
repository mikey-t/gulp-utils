import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createTarball } from '../src/generalUtils.js'

const tmpDir = path.join(__dirname, 'tmp')

const ensureEmptyTmpDir = async () => {
  if (fs.existsSync(tmpDir)) {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  }
  await fsp.mkdir(tmpDir)
}

beforeAll(async () => {
  await ensureEmptyTmpDir()
})

test('createTarball works and stuff', async () => {
  const tarballPath = path.join(tmpDir, 'test.tar.gz')
  await createTarball(path.join(__dirname, 'fixtures', 'dirToTarball'), tarballPath)
})
