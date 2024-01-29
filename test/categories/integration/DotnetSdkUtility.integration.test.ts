import assert from 'node:assert'
import { describe, it } from 'node:test'
import { DotnetSdkUtility } from '../../../src/DotnetSdkUtility.js'

describe('getInstalledSdkVersions', () => {
  it('returns expected versions', async () => {
    const versions = await new DotnetSdkUtility().getInstalledSdkVersions()
    assert.strictEqual(versions.length > 0, true, 'should have at least one version of dotnet installed')

    const version6String = '6.0.418'
    const version6 = versions.find(v => v.full === version6String)

    assert.ok(version6, `expected to have dotnet version ${version6String} installed`)
    assert.strictEqual(version6.major, 6)
    assert.strictEqual(version6.minor, 0)
    assert.strictEqual(version6.patch, 418)

    const version8String = '8.0.100'
    const version8 = versions.find(v => v.full === version8String)

    assert.ok(version8, `expected to have dotnet version ${version6String} installed`)
    assert.strictEqual(version8.major, 8)
    assert.strictEqual(version8.minor, 0)
    assert.strictEqual(version8.patch, 100)
  })
})


describe('isSdkMajorVersionInstalled', () => {
  it('returns true for major version 8', async () => {
    const result = await new DotnetSdkUtility().isSdkMajorVersionInstalled(8)
    assert.strictEqual(result, true, 'expected dotnet 8 to be detected as installed')
  })
  it('returns false for major version 4', async () => {
    const result = await new DotnetSdkUtility().isSdkMajorVersionInstalled(4)
    assert.strictEqual(result, false, 'expected dotnet 4 to be detected as NOT installed')
  })
})

describe('isSdkMajorVersionOrGreaterInstalled', () => {
  it('returns true for major version 8', async () => {
    const result = await new DotnetSdkUtility().isSdkMajorVersionOrGreaterInstalled(8)
    assert.strictEqual(result, true, 'expected true for a version >= 8')
  })
  it('returns true for major version 4', async () => {
    const result = await new DotnetSdkUtility().isSdkMajorVersionOrGreaterInstalled(4)
    assert.strictEqual(result, true, 'expected true for a version >= 4')
  })
  it('returns false for major version 42', async () => {
    const result = await new DotnetSdkUtility().isSdkMajorVersionOrGreaterInstalled(42)
    assert.strictEqual(result, false, 'expected false for a version >= 42')
  })
})
