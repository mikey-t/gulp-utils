import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  Emoji,
  SpawnOptionsWithThrow,
  SpawnResult,
  ensureDirectory,
  getPowershellHackArgs,
  isPlatformMac,
  isPlatformWindows,
  logIf,
  red,
  requireString,
  requireValidPath,
  simpleSpawnSync,
  spawnAsync,
  stringToNonEmptyLines,
  whichSync
} from './generalUtils.js'

/** Control what is logged when running certUtils functions. */
export interface CertLogOptions {
  logSpawnOutput: boolean
  logTraceMessages: boolean
  logElevatedPermissionsMessage: boolean
  logSuccess: boolean
}

export interface GenerateCertOptions extends CertLogOptions {
  /** The directory to write the generated cert files to. Defaults to `./cert`. */
  outputDirectory: string
}

const defaultCertLogOptions: CertLogOptions = {
  logSpawnOutput: false,
  logTraceMessages: false,
  logElevatedPermissionsMessage: true,
  logSuccess: true
}

/** Subject, thumbprint or path to the pfx file. Used with the {@link winUninstallCert} function. */
export type CertIdentifier = string | { thumbprint: string } | { pfxPath: string }

/** The subject or path to the pfx file. Used with the {@link winCertIsInstalled} function. */
export type CertIdentifierWithoutThumbprint = string | { pfxPath: string }

/** Cert info returned by {@link winGetPfxInfo}. */
export type CertInfo = { subject: string, thumbprint: string, pfxPath: string }

/**
 * Wrapper function for calling openssl to generate a self-signed cert to be used for developing a local website with trusted https.
 * @param url The url to generate a cert for. This will be used as the common name (CN) in the cert as well as the filename for the generated cert files.
 * @param options Options for generating the cert.
 * @returns The path to the generated pfx file.
 */
export async function generateCertWithOpenSsl(url: string, options?: Partial<GenerateCertOptions>): Promise<string> {
  requireString('url', url)
  throwIfMaybeBadUrlChars(url)
  const isMac = isPlatformMac()

  const mergedOptions: GenerateCertOptions = { ...defaultCertLogOptions, outputDirectory: './cert', ...options }

  const spawnArgs: SpawnOptionsWithThrow = { cwd: mergedOptions.outputDirectory, stdio: mergedOptions.logSpawnOutput ? 'inherit' : 'pipe' }

  logIf(mergedOptions.logTraceMessages, 'checking if openssl is installed')

  let brewOpenSslPath: string = ''
  if (!isMac) {
    const openSslPath = whichSync('openssl').location
    if (!openSslPath) {
      throw Error('openssl is required but was not found')
    }
    logIf(mergedOptions.logTraceMessages, `using openssl at: ${openSslPath}`)
  } else if (isMac) {
    const brewOpenSslDirectory = getBrewOpensslPath()
    if (!brewOpenSslDirectory) {
      throw Error('openssl (brew version) is required but was not found')
    }
    brewOpenSslPath = `${getBrewOpensslPath()}/bin/openssl`
    if (!fs.existsSync(brewOpenSslPath)) {
      throw Error(`openssl (brew version) is required but was not found at: ${brewOpenSslPath}`)
    } else {
      logIf(mergedOptions.logTraceMessages, `using openssl at: ${brewOpenSslPath}`)
    }
  }

  ensureDirectory(mergedOptions.outputDirectory)
  const crtName = url + '.crt'
  const keyName = url + '.key'
  const pfxName = url + '.pfx'
  const sanCnfName = url + '.cnf'

  const filesToCheck = [crtName, keyName, pfxName, sanCnfName]
  for (const file of filesToCheck) {
    const filePath = path.join(mergedOptions.outputDirectory, file)
    if (fs.existsSync(filePath)) {
      throw Error(`${Emoji.Stop} File ${filePath} already exists. Delete or rename all of the following files from '${mergedOptions.outputDirectory}' if you want to generate a new cert: ${filesToCheck.join(', ')}.`)
    }
  }

  logIf(mergedOptions.logTraceMessages, `writing ${sanCnfName} file for use with openssl command`)
  const sanCnfContents = getSanCnfFileContents(url)
  const sanCnfPath = path.join(mergedOptions.outputDirectory, sanCnfName)
  await fsp.writeFile(sanCnfPath, sanCnfContents)

  logIf(mergedOptions.logTraceMessages, `attempting to generate cert ${pfxName}`)
  const genKeyAndCrtArgs = `req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes -keyout ${keyName} -out ${crtName} -subj /CN=${url} -config ${sanCnfName}`.split(' ')
  const command = isMac ? brewOpenSslPath : 'openssl'
  let result = await spawnAsync(command, genKeyAndCrtArgs, spawnArgs)
  throwIfSpawnResultError(result)

  logIf(mergedOptions.logTraceMessages, 'converting key and crt to pfx')
  const convertToPfxArgs = `pkcs12 -certpbe AES-256-CBC -export -out ${pfxName} -aes256 -inkey ${keyName} -in ${crtName} -password pass:`.split(' ')
  result = await spawnAsync(command, convertToPfxArgs, spawnArgs)
  throwIfSpawnResultError(result)

  const pfxPath = path.join(mergedOptions.outputDirectory, pfxName)

  logIf(mergedOptions.logSuccess, `${Emoji.GreenCheck} Successfully generated cert: ${pfxPath}`)

  return pfxPath
}

/**
 * Uses Powershell to install a cert to the local machine's trusted root store. Must have elevated permissions.
 * If the cert is already installed, this function will do nothing.
 * @param pfxPath The path to the pfx file to install.
 */
export async function winInstallCert(pfxPath: string, options?: Partial<CertLogOptions>) {
  if (!isPlatformWindows()) {
    throw Error('winInstallCert is only supported on Windows')
  }
  validatePfxPath(pfxPath)

  const mergedOptions = { ...defaultCertLogOptions, ...options }

  logIf(mergedOptions.logElevatedPermissionsMessage, getRequiresElevatedPermissionsMessage(true))

  if (await winCertIsInstalled({ pfxPath }, mergedOptions)) {
    const certInfo = await winGetPfxInfo(pfxPath)
    logIf(mergedOptions.logTraceMessages, `${Emoji.Warning} certificate '${pfxPath}' with subject '${certInfo.subject}' is already installed - to install it again, first uninstall it manually or with the winUninstallCert function`)
    return
  }

  logIf(mergedOptions.logTraceMessages, `installing cert '${pfxPath}'`)

  const psCommandArgs = getPowershellHackArgs(`Import-PfxCertificate -FilePath '${pfxPath}' -CertStoreLocation Cert:\\LocalMachine\\Root`)
  const result = await spawnAsync('powershell', psCommandArgs, { stdio: mergedOptions.logSpawnOutput ? 'inherit' : 'pipe' })

  throwIfSpawnResultError(result)

  logIf(mergedOptions.logSuccess, `${Emoji.GreenCheck} Successfully installed cert: ${pfxPath}`)
}

/**
 * Uses Powershell to check if a cert is already installed to the local machine's trusted root store.
 * Uses the subject of the cert in order to avoid false negatives from regenerating the same self-signed cert
 * with the same subject but different thumbprint. Note that this method is geared towards use with certs generated
 * with the {@link generateCertWithOpenSsl} function, so this may not work using subject if your subject is not precisely "`CN=<url>`".
 * @param identifier The subject or path to the pfx file of the cert to check.
 * @returns `true` if the cert is already installed, `false` otherwise.
 */
export async function winCertIsInstalled(identifier: CertIdentifierWithoutThumbprint, options?: Partial<CertLogOptions>): Promise<boolean> {
  if (!isPlatformWindows()) {
    throw new Error('winCertIsInstalled is only supported on Windows')
  }

  const mergedOptions = { ...defaultCertLogOptions, ...options }

  let psCommandArgs

  // Get the count of certs installed with the same subject as the one we're trying to install
  if (typeof identifier === 'string') {
    requireString('subject', identifier)
    validateSubject(identifier)
    const subject = identifier.startsWith('CN=') ? identifier : `CN=${identifier}`
    psCommandArgs = getPowershellHackArgs(`Write-Host (Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object { $_.Subject -eq '${subject}' } | Measure-Object).Count`)
  } else if ('pfxPath' in identifier) {
    validatePfxPath(identifier.pfxPath)
    psCommandArgs = getPowershellHackArgs(`Write-Host (Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object { $_.Subject -eq (Get-PfxCertificate -FilePath '${identifier.pfxPath}').Subject } | Measure-Object).Count`)
  }

  logIf(mergedOptions.logTraceMessages, `checking if cert '${typeof identifier === 'string' ? `with subject '${identifier}` : `with pfxPath ${identifier.pfxPath}`}' is already installed`)

  const result = await spawnAsync('powershell', psCommandArgs, { stdio: 'pipe' })

  throwIfSpawnResultError(result)

  const lines = stringToNonEmptyLines(result.stdout)

  if (lines.length !== 1) {
    throw new Error(`Unexpected output from powershell command to check if the cert is already installed: ${result.stdout}`)
  }

  return lines[0].trim() !== '0'
}

/**
 * Uses Powershell to uninstall a cert from the local machine's trusted root store. Must have elevated permissions.
 * @param identifier The subject, thumbprint or path to the pfx file of the cert to uninstall.
 * @param options Options for uninstalling the cert.
 */
export async function winUninstallCert(identifier: CertIdentifier, options?: Partial<CertLogOptions>) {
  if (!isPlatformWindows()) {
    throw new Error('winUninstallCert is only supported on Windows')
  }

  const mergedOptions = { ...defaultCertLogOptions, ...options }

  logIf(mergedOptions.logElevatedPermissionsMessage, getRequiresElevatedPermissionsMessage(false))

  let psCommandArgs

  if (typeof identifier === 'string') {
    requireString('subject', identifier)
    validateSubject(identifier)
    psCommandArgs = getPowershellHackArgs(`Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object { $_.Subject -match '${identifier}' } | Remove-Item`)
  } else if ('thumbprint' in identifier) {
    validateNoQuotes('thumbprint', identifier.thumbprint)
    psCommandArgs = getPowershellHackArgs(`Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object { $_.Thumbprint -eq '${identifier.thumbprint}' } | Remove-Item`)
  } else if ('pfxPath' in identifier) {
    validatePfxPath(identifier.pfxPath)
    psCommandArgs = getPowershellHackArgs(`$thumbprint = (Get-PfxCertificate -FilePath '${identifier.pfxPath}').Thumbprint; Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object { $_.Thumbprint -eq $thumbprint } | Remove-Item`)
  }

  logIf(mergedOptions.logTraceMessages, `uninstalling cert ${typeof identifier === 'string' ? `'${identifier}'` : JSON.stringify(identifier)}`)

  const result = await spawnAsync('powershell', psCommandArgs, { stdio: mergedOptions.logSpawnOutput ? 'inherit' : 'pipe' })

  throwIfSpawnResultError(result)

  logIf(mergedOptions.logSuccess, `${Emoji.GreenCheck} Successfully uninstalled cert`)
}

/**
 * Uses Powershell to get info about a cert.
 * @param pfxPath The path to the pfx file to get info for.
 * @returns The subject, thumbprint and pfxPath of the cert.
 */
export async function winGetPfxInfo(pfxPath: string): Promise<CertInfo> {
  if (!isPlatformWindows()) {
    throw new Error('winGetPfxInfo is only supported on Windows')
  }
  validatePfxPath(pfxPath)

  const psCommandArgs = getPowershellHackArgs(`Get-PfxCertificate -FilePath '${pfxPath}' | Select-Object -Property Subject, Thumbprint, @{Name='PfxPath';Expression={'${pfxPath}'}} | ConvertTo-Json`)
  const result = await spawnAsync('powershell', psCommandArgs, { stdio: 'pipe' })

  throwIfSpawnResultError(result)

  const json = result.stdout.trim()
  const parsedJson = JSON.parse(json)

  const certInfo: CertInfo = {
    subject: parsedJson.Subject,
    thumbprint: parsedJson.Thumbprint,
    pfxPath: parsedJson.PfxPath
  }

  return certInfo
}

/**
 * Does not actually do anything - just outputs the manual instructions for installing a cert for use by chrome on linux.
 */
export function linuxInstallCert() {
  const instructions = `Automated linux cert install not supported (chrome does not use system certs without significant extra configuration).
Manual Instructions:
- In Chrome, go to chrome://settings/certificates
- Select Authorities -> import
- Select your generated .crt file (in the ./cert/ directory by default - if you haven't generated it, see the generateCertWithOpenSsl function)
- Check box for "Trust certificate for identifying websites"
- Click OK
- Reload site`
  console.log(instructions)
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
  const brewResult = simpleSpawnSync('brew', ['--prefix', 'openssl'])
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

function validateSubject(subject: string): void {
  if (subject.includes('\\') || subject.includes('/') || subject.endsWith('.pfx')) {
    throw new Error(`The subject appears to be a file path, which is not allowed. Did you mean to pass something like this instead: { pfxPath: '${subject}' } ?`)
  }
  validateNoQuotes('subject', subject)
}

function validateNoQuotes(name: string, value: string): void {
  if (value.includes("'") || value.includes('"')) {
    throw new Error(`The value passed for '${name}' contains a single or double quote, which is not allowed.`)
  }
}

function throwIfSpawnResultError(result: SpawnResult) {
  if (result.code !== 0) {
    // There won't be any stderr if stdio was set to 'inherit', so we're checking first
    if (result.stderr) {
      console.error(red('Error:'), result.stderr)
    }
    throw Error(`Spawned command failed with exit code ${result.code}`)
  }
}

function validatePfxPath(pfxPath: string): void {
  if (!pfxPath.endsWith('.pfx')) {
    throw new Error('pfxPath must end with .pfx')
  }
  requireValidPath('pfxPath', pfxPath)
  validateNoQuotes('pfxPath', pfxPath)
}

function getRequiresElevatedPermissionsMessage(isInstall = true) {
  return `${Emoji.Info} Important: ${isInstall ? '' : 'un'}installing a certificate requires elevated permissions`
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
