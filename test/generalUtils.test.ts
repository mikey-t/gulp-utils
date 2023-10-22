import assert from 'node:assert'
import path from 'node:path'
import { describe, it } from 'node:test'
import { config } from '../src/NodeCliUtilsConfig.js'
import { conditionallyAsync, getRandomIntInclusive, humanizeTime, requireString, spawnAsync, toWslPath, which, whichSync } from '../src/generalUtils.js'
import { assertErrorMessageEquals, assertErrorMessageStartsWith, fixturesDir } from '../src/testUtils.js'

config.traceEnabled = false

const testParamName = 'test'
const expectedRequireStringError = `Required param '${testParamName}' is missing`

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
