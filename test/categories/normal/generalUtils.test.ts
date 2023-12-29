import assert from 'node:assert'
import path from 'node:path'
import { describe, it } from 'node:test'
import { config } from '../../../src/NodeCliUtilsConfig.js'
import { conditionallyAsync, getRandomIntInclusive, humanizeTime, isChildPath, requireString, spawnAsync, toWslPath, which, whichSync, wslPathExists } from '../../../src/generalUtils.js'
import { assertErrorMessageEquals, assertErrorMessageStartsWith, fixturesDir } from '../../../src/testUtils.js'

config.traceEnabled = false

const testParamName = 'test'
const expectedRequireStringError = `Required param '${testParamName}' is missing`
const childPathCheckParentDirRelative = './test/fixtures/isChildPathTest/parent'
const childPathCheckParentDir = path.resolve(childPathCheckParentDirRelative)

describe('humanizeTime', () => {
  it('should return 0 ms for 0', () => {
    assert.equal(humanizeTime(0), '0 ms')
  })
  it('should return 1 ms for 1', () => {
    assert.equal(humanizeTime(1), '1 ms')
  })
  it('should return 1 second for 1000', () => {
    assert.equal(humanizeTime(1000), '1 second')
  })
  it('should return 59 seconds for 59000', () => {
    assert.equal(humanizeTime(59000), '59 seconds')
  })
  it('should return 1 minute for 60000', () => {
    assert.equal(humanizeTime(60000), '1 minute')
  })
  it('should return 59 minutes for 3540000', () => {
    assert.equal(humanizeTime(3540000), '59 minutes')
  })
  it('should return 1 hour for 3600000', () => {
    assert.equal(humanizeTime(3600000), '1 hour')
  })
  it('should return 1.01 hours for 3660000', () => {
    assert.ok(['1.01 hours', '1.02 hours'].includes(humanizeTime(3660000)))
  })
})

describe('requireString', () => {
  it('does not throw if paramValue is a non-empty string', () => {
    requireString(testParamName, 'non-empty')
    assert.ok(true)
  })
  it('throws if paramValue is undefined', () => {
    // @ts-ignore
    assert.throws(() => requireString(testParamName, undefined), err => assertErrorMessageEquals(err, expectedRequireStringError))
  })
  it('throws if paramValue is null', () => {
    // @ts-ignore
    assert.throws(() => requireString(testParamName, null), err => assertErrorMessageEquals(err, expectedRequireStringError))
  })
  it('throws if paramValue is \'\'', () => {
    assert.throws(() => requireString(testParamName, ''), err => assertErrorMessageEquals(err, expectedRequireStringError))
  })
  it('throws if paramValue is empty string of non-zero length', () => {
    assert.throws(() => requireString(testParamName, '  '), err => assertErrorMessageEquals(err, expectedRequireStringError))
  })
  it('throws if paramValue is not a string', () => {
    // @ts-ignore
    assert.throws(() => requireString(testParamName, { someProp: 'some-val' }), err => assertErrorMessageEquals(err, expectedRequireStringError))
  })
})

describe('which', () => {
  it('should return the path to the executable', async () => {
    const result = await which('node')
    assert.ok(result && (result.location?.endsWith('node') || result.location?.endsWith('node.exe')))
  })
  it('should have a result with an undefined location if the executable is not found', async () => {
    const result = await which('some-non-existent-executable')
    assert.ok(result && result.location === undefined)
  })
  it('does not allow empty string', async () => {
    await assert.rejects(which(''), err => assertErrorMessageEquals(err, `Required param 'commandName' is missing`))
  })
  it('does not allow shell metacharacters', async () => {
    await assert.rejects(which('node; echo "hello"'), err => assertErrorMessageStartsWith(err, `commandName cannot contain shell meta characters`))
  })
})

describe('whichSync', () => {
  it('should return the path to the executable', () => {
    const result = whichSync('node')
    assert.ok(result && (result.location?.endsWith('node') || result.location?.endsWith('node.exe')))
  })
  it('should have a result with an undefined location if the executable is not found', () => {
    const result = whichSync('some-non-existent-executable')
    assert.ok(result && result.location === undefined)
  })
  it('does not allow empty string', () => {
    assert.throws(() => whichSync(''), err => assertErrorMessageEquals(err, `Required param 'commandName' is missing`))
  })
  it('does not allow shell metacharacters', () => {
    assert.throws(() => whichSync('node; echo "hello"'), err => assertErrorMessageStartsWith(err, `commandName cannot contain shell meta characters`))
  })
})

describe('toWslPath', () => {
  it('converts a windows path to a wsl path', () => {
    const winPath = 'C:\\the\\PaTh\\iN\\winDows'
    const expected = '/mnt/c/the/PaTh/iN/winDows'
    const wslPath = toWslPath(winPath)
    assert.strictEqual(wslPath, expected)
  })
  it('uses the drive letter in the converted path', () => {
    const winPath = 'D:\\the\\PaTh\\iN\\winDows'
    const expected = '/mnt/d/the/PaTh/iN/winDows'
    const wslPath = toWslPath(winPath)
    assert.strictEqual(wslPath, expected)
  })
  it('returns the input unchanged if path is not absolute', () => {
    const winPath = '.\\somethingRelative'
    const wslPath = toWslPath(winPath)
    assert.strictEqual(wslPath, winPath)
  })
  it('single quotes paths with spaces in it', () => {
    const winPath = 'C:\\a\\path with\\spaces'
    const expected = `'/mnt/c/a/path with/spaces'`
    const wslPath = toWslPath(winPath)
    assert.strictEqual(wslPath, expected)
  })
  it('double quotes paths with spaces and single quotes in it', () => {
    const winPath = `C:\\a\\path with\\spaces\\and'single'quotes`
    const expected = `"/mnt/c/a/path with/spaces/and'single'quotes"`
    const wslPath = toWslPath(winPath)
    assert.strictEqual(wslPath, expected)
  })
  it('double quotes paths with single quotes and no spaces in it', () => {
    const winPath = `C:\\a\\path\\without\\spaces\\and'single'quotes`
    const expected = `"/mnt/c/a/path/without/spaces/and'single'quotes"`
    const wslPath = toWslPath(winPath)
    assert.strictEqual(wslPath, expected)
  })
  it('does not single quotes paths with spaces in it if quote option set to false', () => {
    const winPath = 'C:\\a\\path with\\spaces'
    const expected = '/mnt/c/a/path with/spaces'
    const wslPath = toWslPath(winPath, false)
    assert.strictEqual(wslPath, expected)
  })
  it('does not double quote paths with spaces and single quotes in it if quote option is set to false', () => {
    const winPath = `C:\\a\\path with\\spaces\\and'single'quotes`
    const expected = `/mnt/c/a/path with/spaces/and'single'quotes`
    const wslPath = toWslPath(winPath, false)
    assert.strictEqual(wslPath, expected)
  })
})

interface Fruit {
  name: string
  color: string
}

async function getFruits(): Promise<Fruit[]> {
  return [
    { name: 'orange', color: 'orange' },
    { name: 'strawberry', color: 'red' }
  ]
}

describe('conditionallyAsync', () => {
  it('returns result if condition is true', async () => {
    const expected = await getFruits()
    const result = await conditionallyAsync<Fruit[]>(true, getFruits)
    assert.deepStrictEqual(result, expected)
  })
  it('returns undefined if condition is false', async () => {
    const result = await conditionallyAsync<Fruit[]>(false, getFruits)
    assert.strictEqual(result, undefined)
  })
  it('returns result if condition is function that returns true', async () => {
    const expected = await getFruits()
    const result = await conditionallyAsync<Fruit[]>(async () => true, getFruits)
    assert.deepStrictEqual(result, expected)
  })
  it('returns undefined if condition is function that returns false', async () => {
    const result = await conditionallyAsync<Fruit[]>(async () => false, getFruits)
    assert.strictEqual(result, undefined)
  })
})

describe('spawnAsync', () => {
  it('can spawn a simple node script', async () => {
    const result = await spawnAsync('node', [path.join(fixturesDir, 'nodeScript.js')])
    assert.strictEqual(result.code, 0)
  })
  it('result has non-zero code attempting to spawn node against nonexistent script', async () => {
    const result = await spawnAsync('node', [path.join(fixturesDir, 'thisScriptDoesNotExist.js')], { stdio: 'pipe' })
    assert.strictEqual(result.code, 1)
  })
})

describe('getRandomIntInclusive', () => {
  it('returns all the same number of min and max are the same', () => {
    const results: number[] = []
    for (let i = 0; i < 50; i++) {
      results.push(getRandomIntInclusive(42, 42))
    }
    const expected = Array(50).fill(42)
    assert.deepStrictEqual(results, expected)
  })
  it('throws if max is less than min', () => {
    assert.throws(() => getRandomIntInclusive(42, 41), err => assertErrorMessageStartsWith(err, 'The value of "max" is out of range.'))
  })
  it('works for negative numbers', () => {
    const result = getRandomIntInclusive(-5, -1)
    assert.strictEqual(result <= -1 && result >= -5, true, 'The random number generated was not in the negative range specified by the params -5 and -1')
  })
})

describe('isChildPath', () => {
  it('should return true for relative paths and child is subdirectory of parentDir', () => {
    const parentDir = childPathCheckParentDirRelative
    const child = `${childPathCheckParentDirRelative}/child`
    const actual = isChildPath(parentDir, child)
    assert.strictEqual(actual, true)
  })
  it('should return true when child is a relative file that exists', () => {
    const parentDir = childPathCheckParentDirRelative
    const child = `${childPathCheckParentDirRelative}/child/placeholder.txt`
    const actual = isChildPath(parentDir, child)
    assert.strictEqual(actual, true)
  })
  it('should return true when child is a relative file that does not exist', () => {
    const parentDir = childPathCheckParentDirRelative
    const child = `${childPathCheckParentDirRelative}/child/does-not-exist.txt`
    const actual = isChildPath(parentDir, child)
    assert.strictEqual(actual, true)
  })
  it('should return false for relative paths when child is not a subdirectory of parentDir', () => {
    const parentDir = './test/fixtures/isChildPathTest/parent'
    const child = './test/fixtures/isChildPathTest'
    const actual = isChildPath(parentDir, child)
    assert.strictEqual(actual, false)
  })
  it('should return true for absolute paths when child is subdirectory of parentDir', () => {
    const parentDir = path.resolve(childPathCheckParentDir)
    const child = path.resolve(path.join(childPathCheckParentDir, 'some-directory'))
    const actual = isChildPath(parentDir, child)
    assert.strictEqual(actual, true)
  })
  it('should return false for absolute paths when child is not a subdirectory of parentDir', () => {
    const parentDir = path.resolve(childPathCheckParentDir)
    const child = path.resolve(path.join(childPathCheckParentDir, '../../some-directory'))
    const actual = isChildPath(parentDir, child)
    assert.strictEqual(actual, false)
  })
  it('should return true for paths with ".."', () => {
    const parentDir = `${childPathCheckParentDirRelative}/../`
    const child = `${childPathCheckParentDirRelative}/child`
    const actual = isChildPath(parentDir, child)
    assert.strictEqual(actual, true)
  })
  it('should return false for paths with ".." that reach parent directory', () => {
    const parent = childPathCheckParentDirRelative
    const child = `${childPathCheckParentDirRelative}/..`
    const actual = isChildPath(parent, child)
    assert.strictEqual(actual, false)
  })
  it('should return false for paths with ".." that reach above the parent directory', () => {
    const parent = childPathCheckParentDirRelative
    const child = `${childPathCheckParentDirRelative}/../../`
    const actual = isChildPath(parent, child)
    assert.strictEqual(actual, false)
  })
  it('should return false if directory is checked against itself', () => {
    const actual = isChildPath(childPathCheckParentDir, childPathCheckParentDir)
    assert.strictEqual(actual, false)
  })
  it('should return true when parent is relative and child is absolute', () => {
    const parent = childPathCheckParentDirRelative
    const child = path.resolve(path.join(childPathCheckParentDir, 'child'))
    const actual = isChildPath(parent, child)
    assert.strictEqual(actual, true)
  })
  it('should return true when parent is absolute and child is relative', () => {
    const parent = childPathCheckParentDirRelative
    const child = path.resolve(path.join(childPathCheckParentDir, 'child'))
    const actual = isChildPath(parent, child)
    assert.strictEqual(actual, true)
  })
  it('should return false when child is relative and outside the parentDir', () => {
    const parent = childPathCheckParentDirRelative
    const child = './someFile.txt'
    const actual = isChildPath(parent, child)
    assert.strictEqual(actual, false)
  })
  it('throws if child path does not exist and requireChildExists is set to true', () => {
    const parent = childPathCheckParentDirRelative
    const child = './someFile.txt'
    assert.throws(
      () => isChildPath(parent, child, true),
      err => assertErrorMessageEquals(err, 'The child path passed does not exist and requireChildExists was set to true')
    )
  })
  it('throws if parentDir does not exist', () => {
    assert.throws(
      () => isChildPath('./test/fixtures/does-not-exist', './test/fixtures/isChildPathTest/child'),
      err => assertErrorMessageStartsWith(err, 'Invalid or nonexistent path provided')
    )
  })
  it('throws if parentDir is not a directory', () => {
    assert.throws(
      () => isChildPath('./test/fixtures/isChildPathTest/parent/placeholder.txt', './test/fixtures/isChildPathTest/parent/placeholder.txt/child'),
      err => assertErrorMessageEquals(err, 'The parentDir param must be an existing directory')
    )
  })
})

describe('wslPathExists', () => {
  it('returns false for empty paths', () => {
    let result = wslPathExists('')
    assert.strictEqual(result, false)
    result = wslPathExists(null!)
    assert.strictEqual(result, false)
    result = wslPathExists(' ')
    assert.strictEqual(result, false)
  })
  it('returns false for non-existent path', () => {
    const result = wslPathExists('/mnt/f/nowhere')
    assert.strictEqual(result, false)
  })
  it('returns true for directory that exists', () => {
    const result = wslPathExists('/mnt/c/Users/')
    assert.strictEqual(result, true)
  })
  it('returns true for paths that exist with valid double quotes', () => {
    let result = wslPathExists('/mnt/c/"Program Files"/')
    assert.strictEqual(result, true)
    result = wslPathExists('"/mnt/c/Program Files/"')
    assert.strictEqual(result, true)
  })
  it('returns true for paths that exist with spaces', () => {
    const result = wslPathExists('/mnt/c/Program Files/')
    assert.strictEqual(result, true)
  })
  it('returns true for file that exists', () => {
    const result = wslPathExists('/mnt/c/Windows/System32/drivers/etc/hosts')
    assert.strictEqual(result, true)
  })
})
