import assert from 'node:assert'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, describe, it } from 'node:test'
import { GenerateCertOptions, generateCertWithOpenSsl, winCertIsInstalled, winGetPfxInfo, winInstallCert, winUninstallCert } from '../src/certUtils.js'
import { assertErrorMessageIncludes, ensureEmptyTempDir, fileExistsAndIsNonZero, tempDir } from '../src/testUtils.js'

const certTempDir = path.join(tempDir, 'cert-test')
const shouldLog = false
const certOptions: GenerateCertOptions = { outputDirectory: certTempDir, logSpawnOutput: shouldLog, logTraceMessages: shouldLog, logSuccess: shouldLog, logElevatedPermissionsMessage: shouldLog }
const url = 'local.cert-test.mikeyt.net'

function getExpectedCertFilePaths(url: string) {
  return [
    path.join(certTempDir, url + '.crt'),
    path.join(certTempDir, url + '.key'),
    path.join(certTempDir, url + '.pfx'),
    path.join(certTempDir, url + '.cnf')
  ]
}

beforeEach(async () => {
  await ensureEmptyTempDir(certTempDir)
})

describe('generateCertWithOpenSsl', () => {
  it('generates expected files', async () => {
    const expectedGeneratedFiles = getExpectedCertFilePaths(url)

    await generateCertWithOpenSsl(url, certOptions)
    for (const f of expectedGeneratedFiles) {
      assert.ok(fileExistsAndIsNonZero(f))
    }
  })

  it('throws if any of the cert files already exists', async () => {
    const expectedErrorPartTemplate = `${url}.__ext__ already exists`
    const extensions = ['crt', 'key', 'pfx', 'cnf']
    const expectedGeneratedFiles = getExpectedCertFilePaths(url)

    // Run generate method first and assert the files exist before we can verify that their existence causes the expected thrown errors
    await generateCertWithOpenSsl(url, certOptions)
    for (const f of expectedGeneratedFiles) {
      assert.ok(fileExistsAndIsNonZero(f))
    }

    for (const ext of extensions) {
      const expectedErrorPart = expectedErrorPartTemplate.replace('__ext__', ext)
      await assert.rejects(
        generateCertWithOpenSsl(url, certOptions),
        err => assertErrorMessageIncludes(err, expectedErrorPart)
      )
      await fsp.unlink(path.join(certTempDir, `${url}.${ext}`))
    }
  })
})

describe('winInstallCert and winUninstallCert (must be run as admin)', () => {
  it('installs and uninstalls cert successfully', async () => {
    const pfxPath = await generateCertWithOpenSsl(url, certOptions)
    assert.ok(fileExistsAndIsNonZero(pfxPath))

    await winInstallCert(pfxPath, certOptions)

    await winUninstallCert(url, certOptions)
  })

  it('uninstalls the cert successfully when the identifier is the pfx file path', async () => {
    const pfxPath = await generateCertWithOpenSsl(url, certOptions)
    assert.ok(fileExistsAndIsNonZero(pfxPath))

    await winInstallCert(pfxPath, certOptions)

    await winUninstallCert({ pfxPath }, certOptions)
  })

  it('uninstalls the cert successfully when the identifier is the subject with the "CN=" prefix', async () => {
    const pfxPath = await generateCertWithOpenSsl(url, certOptions)
    assert.ok(fileExistsAndIsNonZero(pfxPath))

    await winInstallCert(pfxPath, certOptions)

    await winUninstallCert("CN=" + url, certOptions)
  })

  it('uninstalls the cert successfully when the identifier is the thumbprint', async () => {
    const pfxPath = await generateCertWithOpenSsl(url, certOptions)
    assert.ok(fileExistsAndIsNonZero(pfxPath))

    await winInstallCert(pfxPath, certOptions)

    const certInfo = await winGetPfxInfo(pfxPath)
    assert(certInfo.thumbprint)

    await winUninstallCert({ thumbprint: certInfo.thumbprint }, certOptions)
  })
})

describe('winCertIsInstalled', () => {
  it('returns false when the cert is not installed (passing subject)', async () => {
    const result = await winCertIsInstalled(url, certOptions)
    assert.strictEqual(result, false)
  })

  it('returns false when the cert is not installed (passing pfxPath)', async () => {
    const pfxPath = await generateCertWithOpenSsl(url, certOptions)
    assert.ok(fileExistsAndIsNonZero(pfxPath))

    const result = await winCertIsInstalled({ pfxPath }, certOptions)
    assert.strictEqual(result, false)
  })

  it('returns true when the cert is installed (passing subject)', async () => {
    const pfxPath = await generateCertWithOpenSsl(url, certOptions)
    assert.ok(fileExistsAndIsNonZero(pfxPath))

    await winInstallCert(pfxPath, certOptions)

    const result = await winCertIsInstalled(url, certOptions)
    assert.strictEqual(result, true)

    await winUninstallCert(url, certOptions)
  })

  it('returns true when the cert is installed (passing pfxPath)', async () => {
    const pfxPath = await generateCertWithOpenSsl(url, certOptions)
    assert.ok(fileExistsAndIsNonZero(pfxPath))

    await winInstallCert(pfxPath, certOptions)

    const result = await winCertIsInstalled({ pfxPath }, certOptions)
    assert.strictEqual(result, true)

    await winUninstallCert(url, certOptions)
  })
})
