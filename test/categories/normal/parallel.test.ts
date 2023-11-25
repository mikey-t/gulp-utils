import assert from 'node:assert'
import { describe, it } from 'node:test'
import { config as nodeCliUtilsConfig } from '../../../src/NodeCliUtilsConfig.js'
import { sleep, trace } from '../../../src/generalUtils.js'
import { ParallelResult, runParallel } from '../../../src/parallel.js'
import { assertErrorMessageEquals } from '../../../src/testUtils.js'

// Change vars temporarily to experiment with different scenarios
nodeCliUtilsConfig.traceEnabled = false
const useTimeDelay = false
const totalNumItems = 50 // Must be at least 11 for test usage (see below)
const delayMin = 250
const delayMax = 1337

describe('runParallel', () => {
  it('returns all successes for a simple scenario', async () => {
    const [strings, numbers] = getItems()
    const result = await runParallel(strings, doStuff, (() => true))
    assertAllSuccessful(result, strings, numbers)
  })
  it('returns all successes with maxConcurrent set to 1', async () => {
    const [strings, numbers] = getItems()
    const result = await runParallel<string, number>(strings, doStuff, (() => true), { maxConcurrent: 1 })
    assertAllSuccessful(result, strings, numbers)
  })
  it('returns all successes with maxConcurrent set to 1000', async () => {
    const [strings, numbers] = getItems()
    const result = await runParallel<string, number>(strings, doStuff, (() => true), { maxConcurrent: 1000 })
    assertAllSuccessful(result, strings, numbers)
  })
  it('throws if maxConcurrent is <= 0', async () => {
    const [strings,] = getItems()
    const expectedMaxConcurrentError = 'Invalid value passed for maxConcurrent - must be greater than 0'
    await assert.rejects(
      runParallel<string, number>(strings, doStuff, (() => true), { maxConcurrent: 0 }),
      err => assertErrorMessageEquals(err, expectedMaxConcurrentError)
    )
    await assert.rejects(
      runParallel<string, number>(strings, doStuff, (() => true), { maxConcurrent: -1 }),
      err => assertErrorMessageEquals(err, expectedMaxConcurrentError)
    )
  })
  it('handles skips from using the shouldSkipFunc param', async () => {
    const [strings,] = getItems()
    const shouldSkip = (str: string) => str === 'item5' || str === 'item11'
    const result = await runParallel(strings, doStuff, (() => true), { shouldSkipFunc: shouldSkip })
    assertSkippedItem(result, 'item5')
    assertSkippedItem(result, 'item11')
    assert.strictEqual(result.numSkipped, 2)
    assert.strictEqual(result.numSuccessful, strings.length - 2)
    assert.strictEqual(result.numFailed, 0, 'skips should not count as failures')
  })
  it('handles skips from using the onlyFirstN param', async () => {
    const [strings,] = getItems()
    const result = await runParallel(strings, doStuff, (() => true), { onlyFirstN: 5 })
    assert.strictEqual(result.allInputItems.length, 5)
    assert.strictEqual(result.numSkipped, 0, 'items skipped because of onlyFirstN should not count towards the skipped results number')
    assert.strictEqual(result.numSuccessful, 5)
    assert.strictEqual(result.numFailed, 0)
    assert.strictEqual(result.noFailures, true)
    assert.strictEqual(result.onlyFirstN, 5)
  })
  it('handles failures from evaluations using isResultSuccessFunc param', async () => {
    const [strings,] = getItems()
    const isSuccess = (num: number) => num !== 5 && num !== 11
    const result = await runParallel(strings, doStuff, isSuccess)
    assert.strictEqual(result.numFailed, 2)
    assert.strictEqual(result.numSuccessful, strings.length - 2)
    assert.strictEqual(result.numSkipped, 0)
    assert.strictEqual(result.numTotalItems, strings.length)
    assertFailedItem(result, 'item5', 5)
    assertFailedItem(result, 'item11', 11)
  })
  it('handles failures from rejected promises (executorFunc thrown errors)', async () => {
    const [strings,] = getItems()
    const doStuffWithErrors = async (item: string): Promise<number> => {
      const num = parseInt(item.slice(4), 10)
      if (num === 5 || num === 11) {
        throw new Error('Example error from executorFunc')
      }
      return num
    }
    const result = await runParallel(strings, doStuffWithErrors, (() => true))
    assert.strictEqual(result.numFailed, 2)
    assert.strictEqual(result.numSuccessful, strings.length - 2)
    assert.strictEqual(result.numSkipped, 0)
    assert.strictEqual(result.numTotalItems, strings.length)
    assertRejectedItem(result, 'item5')
    assertRejectedItem(result, 'item11')
  })
})

function getRandomIntInclusive(min: number, max: number): number {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1) + min)
}

function getDelayTime(): number {
  return getRandomIntInclusive(delayMin, delayMax)
}

async function doStuff(item: string): Promise<number> {
  trace(`doStuff called for ${item}`)
  if (useTimeDelay) {
    await sleep(getDelayTime())
  }
  trace(`doStuff finished for ${item}`)
  return parseInt(item.slice(4), 10)
}

function getItems(): [string[], number[]] {
  const strings: string[] = []
  const numbers: number[] = []
  for (let i = 1; i <= totalNumItems; i++) {
    strings.push(`item${i}`)
    numbers.push(i)
  }
  return [strings, numbers]
}

function sortNumbers(numbers: number[]) {
  return numbers.sort((a, b) => a - b)
}

function assertAllSuccessful(result: ParallelResult<string, number>, originalInputItems: string[], expectedNumbers: number[]) {
  const expectedCount = expectedNumbers.length
  assert.strictEqual(result.numTotalItems, expectedCount)
  assert.strictEqual(result.failedItemResults.length, 0)
  assert.strictEqual(result.successfulItemResults.length, expectedCount)
  assert.strictEqual(result.rejectedItemResults.length, 0)
  assert.strictEqual(result.skippedItemResults.length, 0)
  assert.strictEqual(result.noFailures, true)
  assert.strictEqual(result.numFailed, 0)
  assert.strictEqual(result.numSkipped, 0)
  assert.strictEqual(result.numRejected, 0)
  assert.strictEqual(result.numSuccessful, expectedCount)
  assert.deepStrictEqual(sortNumbers(result.successfulItemResults.map(r => r.outputResult!)), expectedNumbers)
  assert.deepStrictEqual(result.allInputItems, originalInputItems)
  assert.strictEqual(result.allOutputResults.length, expectedCount)
  for (let i = 0; i < originalInputItems.length; i++) {
    assertSuccessfulItem(result, originalInputItems[i], expectedNumbers[i])
  }
}

function assertSuccessfulItem(result: ParallelResult<string, number>, itemString: string, outputNumber: number) {
  const successful = result.allItemResults.find(r => r.inputItem === itemString)
  if (successful === undefined) {
    assert.fail(`item that should have succeeded did not appear in the results: ${itemString}`)
  }
  assert.strictEqual(successful.skipped, false, 'skipped should be set to false')
  assert.strictEqual(successful.success, true, 'success should be set to true')
  assert.strictEqual(successful.outputResult, outputNumber, 'the successful result item should have a populated outputResult with the expected value')
}

function assertFailedItem(result: ParallelResult<string, number>, itemString: string, outputNumber: number) {
  const failed = result.allItemResults.find(r => r.inputItem === itemString)
  if (failed === undefined) {
    assert.fail(`item that should have failed did not appear in the results: ${itemString}`)
  }
  assert.strictEqual(failed.skipped, false, 'skipped should be set to false')
  assert.strictEqual(failed.success, false, 'success should be set to false')
  assert.strictEqual(failed.outputResult, outputNumber, 'the failed result item should have a populated outputResult with the expected value')
}

function assertSkippedItem(result: ParallelResult<string, number>, itemString: string) {
  const skipped = result.allItemResults.find(r => r.inputItem === itemString)
  if (skipped === undefined) {
    assert.fail(`item that should have been skipped did not appear in the results: ${itemString}`)
  }
  assert.strictEqual(skipped.skipped, true, 'skipped should be set to true')
  assert.strictEqual(skipped.success, false, 'success should be set to false')
  assert.strictEqual(skipped.outputResult, undefined, 'the outputResult should be undefined')
}

function assertRejectedItem(result: ParallelResult<string, number>, itemString: string) {
  const rejected = result.allItemResults.find(r => r.inputItem === itemString)
  if (rejected === undefined) {
    assert.fail(`item that should have been rejected did not appear in the results: ${itemString}`)
  }
  assert.strictEqual(rejected.skipped, false, 'skipped should be set to false')
  assert.strictEqual(rejected.success, false, 'success should be set to false')
  assert.strictEqual(rejected.outputResult, undefined, 'the outputResult should be undefined')
  const reason = rejected.rejectedReason
  if (reason === undefined) {
    assert.fail(`the rejected reason should not be undefined for item ${itemString}`)
  }
  if (!(reason instanceof Error)) {
    assert.fail('the rejectedReason should be of type Error in our scenario')
  }
  assert.strictEqual(reason.message, 'Example error from executorFunc')
}
