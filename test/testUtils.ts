import assert from 'node:assert'
import fs from 'node:fs'
import fsp from 'node:fs/promises'

export const tmpDir = './test/tmp'
export const fixturesDir = './test/fixtures'
export const only = { only: true } // Convenience object to make it easier to mark tests as "only"

export const ensureEmptyTmpDir = async (dir: string) => {
  if (!dir) {
    throw new Error('dir is required')
  }
  if (!dir.startsWith('test/tmp') && !dir.startsWith('test\\tmp') && !dir.startsWith('./test/tmp') && !dir.startsWith('.\\test\\tmp')) {
    throw new Error(`dir must start with 'test/tmp': ${dir}`)
  }
  if (fs.existsSync(dir)) {
    await fsp.rm(dir, { recursive: true, force: true })
  }
  await fsp.mkdir(dir, { recursive: true })
}

export function fileExistsAndIsNonZero(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath)
    return stats.isFile() && stats.size > 0
  } catch (err) {
    return false
  }
}

export function assertErrorMessageStartsWith(err: unknown, expectedStartsWith: string) {
  assert(err instanceof Error)
  assert.strictEqual(err.message.startsWith(expectedStartsWith), true, 'Error message did not start with expected value')
  return true
}

export function assertErrorMessageIncludes(err: unknown, expectedIncludes: string) {
  assert(err instanceof Error)
  assert.strictEqual(err.message.includes(expectedIncludes), true, 'Error message did not include the expected value')
  return true
}

export function assertErrorMessageEquals(err: unknown, expected: string) {
  assert(err instanceof Error)
  assert.strictEqual(err.message, expected, 'Error message did not equal the expected value')
  return true
}
