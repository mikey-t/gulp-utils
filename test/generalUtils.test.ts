import { describe, it } from 'node:test'
import { humanizeTime, requireString } from '../src/generalUtils.js'
import assert from 'node:assert'
import { assertErrorMessageEquals } from './testUtils.js'

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
