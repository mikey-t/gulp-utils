import assert from 'node:assert'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { describe, it, test } from 'node:test'
import { INugetAccessor, NugetUtility } from '../../../src/NugetUtility.js'
import { TargetFrameworkMoniker } from '../../../src/dotnetUtils.js'
import { StringKeyedDictionary } from '../../../src/generalUtils.js'
import { assertErrorMessageEquals, fixturesDir, only } from '../../../src/testUtils.js'

interface PackageInfo {
  packageName: string
  mockNugetAllVersionsJson: string
  mockLandingHtmlPages: string[] // Be sure this is sorted in descending order so mock NugetAccessor is simulated accurately
  expectedVersionsMap: StringKeyedDictionary
}

const efPackageName = 'Microsoft.EntityFrameworkCore.Design'

async function getPackageInfos(): Promise<PackageInfo[]> {
  return [
    await getPackageInfo(
      efPackageName,
      [
        '8.0.0',
        '7.0.14',
        '6.0.25',
        '5.0.17',
        '3.1.32',
      ],
      {
        'net5.0': '5.0.17',
        'net6.0': '7.0.14',
        'net7.0': '7.0.14',
        'net8.0': '8.0.0'
      }
    ),
    await getPackageInfo(
      'Newtonsoft.Json',
      [
        '13.0.3',
      ],
      {
        'net5.0': '13.0.3',
        'net6.0': '13.0.3',
        'net7.0': '13.0.3',
        'net8.0': '13.0.3'
      }
    )
  ]
}

async function getPackageInfo(packageName: string, majorVersions: string[], expectedVersionsMap: StringKeyedDictionary): Promise<PackageInfo> {
  const packageInfo: PackageInfo = {
    packageName: packageName,
    mockLandingHtmlPages: [],
    mockNugetAllVersionsJson: await getFixtureContent(packageName, 'versions.json'),
    expectedVersionsMap: expectedVersionsMap
  }

  for (const v of majorVersions) {
    packageInfo.mockLandingHtmlPages.push(await getFixtureContent(packageName, `landing_${v}.html`))
  }

  return packageInfo
}

async function getFixtureContent(packageName: string, filename: string) {
  return await fsp.readFile(path.join(fixturesDir, `nugetUtility/${packageName}/${filename}`), 'utf-8')
}

// A bug in NodeJS v18 requires putting this here instead of nested inside the describe function:
// https://github.com/nodejs/node/issues/48845
const packageInfos = await getPackageInfos()

describe('getLatestNugetPackageVersion', async () => {
  for (const packageInfo of packageInfos) {
    // Wrapper test for each nuget package. Setup the "versions json" at the package level since it's the same for every call.
    test(`wrapper test for ${packageInfo.packageName} tests`, async t => {
      const nugetAccessor = new MockNugetAccessor()
      t.mock.method(nugetAccessor, 'getAllVersionsJson', async () => packageInfo.mockNugetAllVersionsJson)

      // Sub-tests for each of the pairs in expectedVersionsMap
      for (const dotnetVersion of Object.keys(packageInfo.expectedVersionsMap)) {
        const expectedVersion = packageInfo.expectedVersionsMap[dotnetVersion]
        await it(`returns version ${expectedVersion} for dotnet version ${dotnetVersion}`, async () => {
          // Note that the landing html mock is setup here instead of outside this loop because there isn't currently a way to reset
          // just the call count without also resetting all the implementations.
          const mockGetLandingHtml = t.mock.method(nugetAccessor, 'getPackageLandingPageHtml')
          for (let i = 0; i < packageInfo.mockLandingHtmlPages.length; i++) {
            mockGetLandingHtml.mock.mockImplementationOnce(async () => packageInfo.mockLandingHtmlPages[i], i)
          }
          mockGetLandingHtml.mock.mockImplementationOnce(
            () => { throw new Error(`mockGetLandingHtml should not receive a call past call number ${packageInfo.mockLandingHtmlPages.length - 1}`) },
            packageInfo.mockLandingHtmlPages.length
          )
          const nugetUtil = new NugetUtility({ nugetAccessor: nugetAccessor })

          const actualVersion = await nugetUtil.getLatestNugetPackageVersion(packageInfo.packageName, dotnetVersion as TargetFrameworkMoniker)

          assert.strictEqual(actualVersion, expectedVersion)
        })
      }
    })
  }
})

describe('getLatestMajorNugetPackageVersion', only, () => {
  it(`returns the major version from the hard-coded list for ${efPackageName} and framework version 'net6.0'`, only, async () => {
    const result = await new NugetUtility({ nugetAccessor: new MockNugetAccessor() }).getLatestMajorNugetPackageVersion(efPackageName, 'net6.0')
    assert.strictEqual(result, 7)
  })
  it(`calls getLatestNugetPackageVersion if the combo isn't in the hard-coded list`, only, async () => {
    const nugetUtility = new NugetUtility({ nugetAccessor: new MockNugetAccessor() })
    await assert.rejects(
      nugetUtility.getLatestMajorNugetPackageVersion(efPackageName, 'net11'),
      err => assertErrorMessageEquals(err, mockError)
    )
  })
})

const mockError = `The mock was not setup correctly if you're seeing this (or it should not have been called)`

// I'm using a separate implementation instead of just mocking the real NugetAccessor because the NodeJS test runner
// dangerously reverts to the underlying implementation in many scenarios. Examples:
// - The "resetCalls" method does indeed reset the call count, but also resets the implementation back to the original
// - When using "mockImplementationOnce" for multiple calls, if it gets past your call count it will simply start calling the underlying real implementation
class MockNugetAccessor implements INugetAccessor {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getAllVersionsJson(packageName: string): Promise<string> {
    throw new Error(mockError)
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getPackageLandingPageHtml(packageName: string, frameworkVersion: string): Promise<string> {
    throw new Error(mockError)
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getNuspec(packageName: string, versionString: string): Promise<string> {
    throw new Error(mockError)
  }
}
