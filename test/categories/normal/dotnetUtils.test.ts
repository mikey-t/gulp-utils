import assert from 'node:assert'
import { describe, it } from 'node:test'
import { isTfmNet5Plus } from '../../../src/dotnetUtils.js'
import { assertErrorMessageEquals } from '../../../src/testUtils.js'

describe('isTfmNet5Plus', () => {
  it('throws if param is null or empty', () => {
    assert.throws(
      // @ts-ignore
      () => isTfmNet5Plus(null),
      err => assertErrorMessageEquals(err, `Required param 'targetFrameworkMoniker' is missing`)
    )
    assert.throws(
      // @ts-ignore
      () => isTfmNet5Plus(undefined),
      err => assertErrorMessageEquals(err, `Required param 'targetFrameworkMoniker' is missing`)
    )
    assert.throws(
      () => isTfmNet5Plus(''),
      err => assertErrorMessageEquals(err, `Required param 'targetFrameworkMoniker' is missing`)
    )
    assert.throws(
      () => isTfmNet5Plus(' '),
      err => assertErrorMessageEquals(err, `Required param 'targetFrameworkMoniker' is missing`)
    )
  })
  it('returns false for "net4.0"', () => {
    const result = isTfmNet5Plus('net4.0')
    assert.strictEqual(result, false)
  })
  it('returns true for versions >= "net5.0"', () => {
    const versions = [5, 6, 7, 8, 9, 999]
    for (const v of versions) {
      const tfm = `net${v}.0`
      const result = isTfmNet5Plus(tfm)
      assert.strictEqual(result, true, `should return true for version ${tfm}`)
    }
  })
  it('returns false if missing "net", such as for "6.0"', () => {
    const result = isTfmNet5Plus('6.0')
    assert.strictEqual(result, false)
  })
  it('returns false if additional characters exist, such as for "netextra6.0"', () => {
    const result = isTfmNet5Plus('netextra6.0')
    assert.strictEqual(result, false)
  })
  it('returns false if "net" is capitalized', () => {
    const result = isTfmNet5Plus('NET6.0')
    assert.strictEqual(result, false)
  })
  it('returns false if prefixed with "."', () => {
    const result = isTfmNet5Plus('.net6.0')
    assert.strictEqual(result, false)
  })
})
