import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import * as nodeCliUtils from './generalUtils.js'
import { log } from './generalUtils.js'

const requiresAdminMessage = `➡️ Important: Requires admin permissions`

/**
 * Wrapper function for calling openssl to generate a self-signed cert to be used for developing a local website with trusted https.
 * @param url The url to generate a cert for. This will be used as the common name (CN) in the cert as well as the filename for the generated cert files.
 * @param outputDirectory The directory to write the generated cert files to. Defaults to './cert'.
 */
export async function generateCertWithOpenSsl(url: string, outputDirectory: string = './cert') {
  nodeCliUtils.requireString('url', url)
  throwIfMaybeBadUrlChars(url)
  const isMac = nodeCliUtils.isPlatformMac()
  const spawnArgs = { cwd: outputDirectory }

  log('- checking if openssl is installed')
  let brewOpenSslPath: string = ''
  if (!isMac) {
    const openSslPath = nodeCliUtils.whichSync('openssl').location
    if (!openSslPath) {
      throw Error('openssl is required but was not found')
    }
    log(`- using openssl at: ${openSslPath}`)
  } else if (isMac) {
    const brewOpenSslDirectory = getBrewOpensslPath()
    if (!brewOpenSslDirectory) {
      throw Error('openssl (brew version) is required but was not found')
    }
    brewOpenSslPath = `${getBrewOpensslPath()}/bin/openssl`
    if (!fs.existsSync(brewOpenSslPath)) {
      throw Error(`openssl (brew version) is required but was not found at: ${brewOpenSslPath}`)
    } else {
      log(`- using openssl at: ${brewOpenSslPath}`)
    }
  }

  nodeCliUtils.ensureDirectory(outputDirectory)
  const keyName = url + '.key'
  const crtName = url + '.crt'
  const pfxName = url + '.pfx'
  const pfxPath = path.join(outputDirectory, pfxName)
  if (fs.existsSync(pfxPath)) {
    throw Error(`File ${pfxPath} already exists. Delete or rename this file if you want to generate a new cert.`)
  }

  log('- writing san.cnf file for use with openssl command')
  const sanCnfContents = getSanCnfFileContents(url)
  const sanCnfPath = path.join(outputDirectory, 'san.cnf')
  await fsp.writeFile(sanCnfPath, sanCnfContents)

  log(`- attempting to generate cert ${pfxName}`)
  const genKeyAndCrtArgs = `req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes -keyout ${keyName} -out ${crtName} -subj /CN=${url} -config san.cnf`.split(' ')
  const command = isMac ? brewOpenSslPath : 'openssl'
  let result = await nodeCliUtils.spawnAsync(command, genKeyAndCrtArgs, spawnArgs)
  if (result.code !== 0) {
    throw Error(`openssl command to generate key and crt files failed with exit code ${result.code}`)
  }

  log('- converting key and crt to pfx')
  const convertToPfxArgs = `pkcs12 -certpbe AES-256-CBC -export -out ${pfxName} -aes256 -inkey ${keyName} -in ${crtName} -password pass:`.split(' ')
  result = await nodeCliUtils.spawnAsync(command, convertToPfxArgs, spawnArgs)
  if (result.code !== 0) {
    throw Error(`openssl command to convert key and crt files to a pfx failed with exit code ${result.code}`)
  }
}

/**
 * Uses Powershell to install a cert to the local machine's trusted root store. Must have admin permissions.
 * 
 * If the cert is already installed, this method will do nothing.
 * @param urlOrCertFilename The url or cert filename to install. The url + '.pfx' or the cert filename passed must match a file that exists in the certDirectory.
 * @param certDirectory The directory to look for the cert file in. Defaults to './cert'.
 */
export async function winInstallCert(urlOrCertFilename: string, certDirectory = './cert') {
  if (!nodeCliUtils.isPlatformWindows()) {
    throw Error('winInstallCert is only supported on Windows')
  }
  nodeCliUtils.requireString('urlOrCertFilename', urlOrCertFilename)
  nodeCliUtils.requireValidPath('certDirectory', certDirectory)
  throwIfMaybeBadUrlChars(urlOrCertFilename, 'urlOrCertFilename')

  if (!nodeCliUtils.isPlatformWindows()) {
    throw Error('This method is only supported on Windows')
  }

  log(requiresAdminMessage)

  if (await winCertAlreadyInstalled(urlOrCertFilename)) {
    log(`certificate for ${urlOrCertFilename} is already installed - to install it again, first uninstall it manually or with the winUninstallCert method`)
    return
  }

  const certName = urlOrCertFilename.endsWith('.pfx') ? urlOrCertFilename : urlOrCertFilename + '.pfx'

  const certPath = path.join(certDirectory, certName)

  if (!fs.existsSync(certPath)) {
    throw Error(`File ${certPath} does not exist. Generate this first if you want to install it.`)
  }

  const psCommandArgs = nodeCliUtils.getPowershellHackArgs(`Import-PfxCertificate -FilePath '${certPath}' -CertStoreLocation Cert:\\LocalMachine\\Root`)
  const result = await nodeCliUtils.spawnAsync('powershell', psCommandArgs)

  if (result.code !== 0) {
    throw Error(`powershell command to install cert failed with exit code ${result.code}`)
  }
}

/**
 * Uses Powershell to uninstall a cert from the local machine's trusted root store. Must have admin permissions.
 * @param urlOrSubject The url or subject of the cert to uninstall. If the cert was installed with the winInstallCert method, this will be the url passed to that method.
 */
export async function winUninstallCert(urlOrSubject: string) {
  if (!nodeCliUtils.isPlatformWindows()) {
    throw Error('winUninstallCert is only supported on Windows')
  }
  nodeCliUtils.requireString('urlOrSubject', urlOrSubject)

  log(requiresAdminMessage)

  const psCommandArgs = nodeCliUtils.getPowershellHackArgs(`Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object { $_.Subject -match '${urlOrSubject}' } | Remove-Item`)
  const result = await nodeCliUtils.spawnAsync('powershell', psCommandArgs)

  if (result.code !== 0) {
    throw Error(`powershell command to uninstall cert failed with exit code ${result.code}`)
  }
}

/**
 * Does not actually do anything - just outputs the manual instructions for installing a cert for use by chrome on linux.
 */
export function linuxInstallCert() {
  const instructions = `Automated linux cert install not supported (chrome does not use system certs without significant extra configuration).
Manual Instructions:
- In Chrome, go to chrome://settings/certificates
- Select Authorities -> import
- Select your generated .crt file (in the ./cert/ directory by default - if you haven't generated it, see the generateCertWithOpenSsl method)
- Check box for "Trust certificate for identifying websites"
- Click OK
- Reload site`
  console.log(instructions)
}

/**
 * Uses Powershell to check if a cert is already installed to the local machine's trusted root store.
 * @param urlOrSubject The url or subject of the cert to check. If the cert was installed with the winInstallCert method, this will be the url passed to that method.
 * @returns `true` if the cert is already installed, `false` otherwise.
 */
export async function winCertAlreadyInstalled(urlOrSubject: string): Promise<boolean> {
  if (!nodeCliUtils.isPlatformWindows()) {
    throw Error('winCertAlreadyInstalled is only supported on Windows')
  }
  const psCommandArgs = nodeCliUtils.getPowershellHackArgs(`Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object { $_.Subject -match '${urlOrSubject}' }`)

  // The stdio option of 'pipe' is important here - if left to default of spawnAsync ('inherit'), stdout will be empty
  const result = await nodeCliUtils.spawnAsync('powershell', psCommandArgs, { stdio: ['inherit', 'pipe', 'pipe'] })

  if (result.code !== 0) {
    throw Error(`powershell command to find installed cert failed with exit code ${result.code}`)
  }

  const lines = nodeCliUtils.stringToNonEmptyLines(result.stdout)

  for (const line of lines) {
    if (line.includes(urlOrSubject)) {
      return true
    }
  }

  return false
}

function throwIfMaybeBadUrlChars(url: string, varName = 'url') {
  if (url.includes(' ')) {
    throw Error(`${varName} should not contain spaces`)
  }
  if (url.includes('/')) {
    throw Error(`${varName} should not contain forward slashes`)
  }
  if (url.includes('\\')) {
    throw Error(`${varName} should not contain backslashes`)
  }
}

function getBrewOpensslPath(): string {
  const brewResult = nodeCliUtils.simpleSpawnSync('brew', ['--prefix', 'openssl'])
  if (brewResult.error) {
    throw Error('error attempting to find openssl installed by brew')
  }
  if (brewResult.stdoutLines.length === 0 || brewResult.stdoutLines.length > 1) {
    throw new Error(`unexpected output from brew command 'brew --prefix openssl': ${brewResult.stdout}`)
  }
  return brewResult.stdoutLines[0]
}

function getSanCnfFileContents(url: string) {
  return sanCnfTemplate.replace(/{{url}}/g, url)
}

// Newer cert requirements force the need for "extension info" with DNS and IP info, but openssl v1.x doesn't support that with the
// CLI option -addext, so we're using a san.cnf file instead and passing this into the CLI command with the -config option.
const sanCnfTemplate = `[req]
distinguished_name=req
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = {{url}}

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = {{url}}
IP.1 = 127.0.0.1

`
