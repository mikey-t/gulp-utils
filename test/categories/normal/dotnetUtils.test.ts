import { describe, it } from 'node:test'
import assert from 'node:assert'
import { assertErrorMessageEquals, only } from '../../../src/testUtils.js'
import { isTargetFrameworkMonikerGreaterThanOrEqualToNet5 } from '../../../src/dotnetUtilsInternal.js'

describe('isTargetFrameworkMonikerGreaterThanOrEqualToNet5', only, () => {
  it('throws if param is null or empty', only, () => {
    assert.throws(
      // @ts-ignore
      () => isTargetFrameworkMonikerGreaterThanOrEqualToNet5(null),
      err => assertErrorMessageEquals(err, `Required param 'targetFrameworkMoniker' is missing`)
    )
    assert.throws(
      // @ts-ignore
      () => isTargetFrameworkMonikerGreaterThanOrEqualToNet5(undefined),
      err => assertErrorMessageEquals(err, `Required param 'targetFrameworkMoniker' is missing`)
    )
    assert.throws(
      () => isTargetFrameworkMonikerGreaterThanOrEqualToNet5(''),
      err => assertErrorMessageEquals(err, `Required param 'targetFrameworkMoniker' is missing`)
    )
    assert.throws(
      () => isTargetFrameworkMonikerGreaterThanOrEqualToNet5(' '),
      err => assertErrorMessageEquals(err, `Required param 'targetFrameworkMoniker' is missing`)
    )
  })
  it('returns false for "net4.0"', only, () => {
    const result = isTargetFrameworkMonikerGreaterThanOrEqualToNet5('net4.0')
    assert.strictEqual(result, false)
  })
  it('returns true for versions >= "net5.0"', only, () => {
    const versions = [5, 6, 7, 8, 9, 999]
    for (const v of versions) {
      const tfm = `net${v}.0`
      const result = isTargetFrameworkMonikerGreaterThanOrEqualToNet5(tfm)
      assert.strictEqual(result, true, `should return true for version ${tfm}`)
    }
  })
  it('returns false if missing "net", such as for "6.0"', only, () => {
    const result = isTargetFrameworkMonikerGreaterThanOrEqualToNet5('6.0')
    assert.strictEqual(result, false)
  })
  it('returns false if additional characters exist, such as for "netextra6.0"', only, () => {
    const result = isTargetFrameworkMonikerGreaterThanOrEqualToNet5('netextra6.0')
    assert.strictEqual(result, false)
  })
  it('returns false if "net" is capitalized', only, () => {
    const result = isTargetFrameworkMonikerGreaterThanOrEqualToNet5('NET6.0')
    assert.strictEqual(result, false)
  })
  it('returns false if prefixed with "."', only, () => {
    const result = isTargetFrameworkMonikerGreaterThanOrEqualToNet5('.net6.0')
    assert.strictEqual(result, false)
  })
})
