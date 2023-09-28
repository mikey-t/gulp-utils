import { ChildProcess, spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { config } from './NodeCliUtilsConfig.js'
import { SpawnError, SpawnOptionsWithThrow, SpawnResult, StringKeyedDictionary, isPlatformWindows, log, requireString, requireValidPath, sortDictionaryByKeyAsc, spawnAsync, stringToNonEmptyLines, trace } from './generalUtils.js'

const isCommonJS = typeof require === "function" && typeof module === "object" && module.exports
const isEsm = !isCommonJS
const spawnWorkaroundScriptName = 'runWhileParentAlive.js'
const currentModuleDir: string = '' // Lazy loaded in getCurrentModuleDir

export async function copyEnv(sourcePath: string, destinationPath: string, overrideExistingDestinationValues = true, suppressAddKeysMessages = false) {
  requireValidPath('sourcePath', sourcePath)

  // If the destination .env file doesn't exist, just copy it and return
  if (!fs.existsSync(destinationPath)) {
    log(`creating ${destinationPath} from ${sourcePath}`)
    await fsp.copyFile(sourcePath, destinationPath)
    return
  }

  const sourceDict = getEnvAsDictionary(sourcePath)
  const destinationDict = getEnvAsDictionary(destinationPath)

  // Determine what keys are missing from destinationPath .env that are in sourcePath .env or .env.template
  const templateKeys = Object.keys(sourceDict)
  const destinationKeysBeforeChanging = Object.keys(destinationDict)
  const keysMissingInDestination = templateKeys.filter(envKey => !destinationKeysBeforeChanging.includes(envKey))

  if (keysMissingInDestination.length > 0) {
    if (!suppressAddKeysMessages) {
      log(`adding missing keys in ${destinationPath}: ${keysMissingInDestination.join(', ')}`)
    }
  }

  // For instances where both .env files have the same key, use the value from the source if
  // overrideExistingDestinationValues param is true, otherwise leave the value from the destination intact.
  const newDict: StringKeyedDictionary = {}
  for (const [key, value] of Object.entries(overrideExistingDestinationValues ? sourceDict : destinationDict)) {
    newDict[key] = value
  }

  // Add entries that the destination doesn't have yet
  for (const key of keysMissingInDestination) {
    newDict[key] = sourceDict[key]
  }

  const newSortedDict: StringKeyedDictionary = sortDictionaryByKeyAsc(newDict)
  const newEnvFileContent = dictionaryToEnvFileString(newSortedDict)
  await fsp.writeFile(destinationPath, newEnvFileContent)
}

export function getEnvAsDictionary(envPath: string): StringKeyedDictionary {
  const dict: StringKeyedDictionary = {}
  const lines = stringToNonEmptyLines(fs.readFileSync(envPath).toString())
  for (const line of lines) {
    if (line && line.indexOf('=') !== -1) {
      const parts = line.split('=')
      dict[parts[0].trim()] = parts[1].trim()
    }
  }
  return dict
}

export function dictionaryToEnvFileString(dict: StringKeyedDictionary): string {
  return Object.entries(dict).map(kvp => `${kvp[0]}=${kvp[1]}`).join('\n') + '\n'
}

export interface SpawnOptionsInternal extends SpawnOptionsWithThrow {
  isLongRunning: boolean
}

export async function spawnAsyncInternal(command: string, args: string[], options?: Partial<SpawnOptionsInternal>): Promise<SpawnResult> {
  const mergedOptions = setDefaultsAndMergeOptions(options)
  const logPrefix = `[${command} ${args.join(' ')}] `

  // Windows has an issue where child processes are orphaned when using the shell option. This workaround will spawn
  // a "middle" process using the shell option to check whether parent process is still running at intervals and if not, kill the child process tree.
  const workaroundScriptPath = await getWorkaroundScriptPath(command, args, options)
  if (workaroundScriptPath) {
    return await spawnWithKeepaliveWorkaround(logPrefix, workaroundScriptPath, command, args, mergedOptions)
  }

  return new Promise((resolve, reject) => {
    try {
      const result: SpawnResult = getInitialSpawnResult()

      const child = spawn(command, args, mergedOptions)
      const childId: number | undefined = child.pid
      if (childId === undefined) {
        throw new Error(`${logPrefix}ChildProcess pid is undefined - spawn failed`)
      }

      // This event will only be emitted when stdio is NOT set to 'inherit'
      child.stdout?.on('data', (data) => {
        result.stdout += data.toString()
      })

      // This event will only be emitted when stdio is NOT set to 'inherit'
      child.stderr?.on('data', (data) => {
        result.stderr += data.toString()
      })

      const listener = new SignalListener(child, logPrefix)

      child.on('exit', (code, signal) => {
        const signalMessage = signal ? ` with signal ${signal}` : ''
        trace(`${logPrefix}ChildProcess exited with code ${code}${signalMessage}`)
        result.code = getResultCode(code, mergedOptions.isLongRunning)
        child.removeAllListeners()
        listener.detach()
        if (mergedOptions.throwOnNonZero && result.code !== 0) {
          reject(getSpawnError(result.code, result, mergedOptions))
          return
        }
        resolve(result)
      })

      child.on('error', (error) => {
        trace(`${logPrefix}ChildProcess emitted an error event: `, error)
      })
    } catch (err) {
      reject(err)
    }
  })
}

// If long running, ctrl+c will cause a null code, which we don't necessarily want to consider an error
function getResultCode(code: number | null, isLongRunning: boolean) {
  return (code === null && isLongRunning) ? 0 : code ?? 1
}

const setDefaultsAndMergeOptions = (options?: Partial<SpawnOptionsInternal>): SpawnOptionsInternal => {
  const defaultSpawnOptions: SpawnOptionsInternal = { stdio: 'inherit', isLongRunning: false, throwOnNonZero: false }
  return { ...defaultSpawnOptions, ...options }
}

// Return workaroundScriptPath if:
// - Long running option set to true
// - OS is Windows
// - It's not the long running workaround call itself (avoid an infinite loop)
// Otherwise return undefined
async function getWorkaroundScriptPath(command: string, args?: string[], options?: Partial<SpawnOptionsInternal>): Promise<string | undefined> {
  const moduleDir = await getCurrentModuleDir()
  let workaroundScriptPath = path.join(moduleDir, spawnWorkaroundScriptName)

  // This allows use of spawnAsyncLongRunning within this project (i.e. swigfile.ts)
  if (!fs.existsSync(workaroundScriptPath) && workaroundScriptPath.includes('node-cli-utils')) {
    workaroundScriptPath = path.resolve('dist/esm', spawnWorkaroundScriptName)
  }

  if (options?.isLongRunning && isPlatformWindows() && !(command === 'node' && args && args[0]?.endsWith(spawnWorkaroundScriptName))) {
    return workaroundScriptPath
  }

  return undefined
}

async function spawnWithKeepaliveWorkaround(logPrefix: string, workaroundScriptPath: string, command: string, args: string[], options: Partial<SpawnOptionsInternal>) {
  trace(`${logPrefix}Running on Windows with shell option - using middle process hack to prevent orphaned processes`)

  const loggingEnabledString = config.orphanProtectionLoggingEnabled.toString()
  const traceEnabledString = config.traceEnabled.toString()
  const pollingMillisString = config.orphanProtectionPollingIntervalMillis.toString()

  trace(`${logPrefix}Orphan protection logging enabled: ${loggingEnabledString}`)
  trace(`${logPrefix}Orphan protection trace enabled: ${traceEnabledString}`)
  trace(`${logPrefix}Orphan protection polling interval: ${pollingMillisString}ms`)
  if (config.orphanProtectionLoggingEnabled) {
    trace(`${logPrefix}Orphan protection logging path: ${config.orphanProtectionLoggingPath}`)
  }

  const workaroundArgs = [
    workaroundScriptPath,
    loggingEnabledString,
    traceEnabledString,
    pollingMillisString,
    command,
    ...(args ?? [])
  ]

  return await spawnAsync('node', workaroundArgs, { ...options, stdio: 'inherit', shell: true })
}

function getInitialSpawnResult(options?: SpawnOptionsInternal): SpawnResult {
  return {
    code: 1,
    stdout: '',
    stderr: '',
    cwd: options?.cwd?.toString() ?? process.cwd()
  }
}

function getSpawnError(code: number, result: SpawnResult, options: Partial<SpawnOptionsInternal>): SpawnError {
  const additional = options.throwOnNonZero && options.stdio === 'inherit' ? `. See above for more details (stdio is 'inherit').` : ''
  return new SpawnError(`Spawning child process failed with code ${code}${additional}`, result)
}

class SignalListener {
  private signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  private child: ChildProcess
  private logPrefix: string

  constructor(child: ChildProcess, logPrefix: string) {
    this.child = child
    this.logPrefix = logPrefix
    this.attach()
  }

  // Arrow function provides unique handler function for each instance of SignalListener
  private handler = (signal: NodeJS.Signals) => {
    trace(`${this.logPrefix}Process received ${signal} - killing ChildProcess with ID ${this.child.pid}`)
    this.child.kill(signal)
    this.detach()
  }

  attach() {
    this.signals.forEach(signal => process.on(signal, this.handler))
  }

  detach() {
    this.signals.forEach(signal => process.removeListener(signal, this.handler))
  }
}

async function getCurrentModuleDir(): Promise<string> {
  if (currentModuleDir) {
    return currentModuleDir
  }
  if (isEsm) {
    const module = await import('./esmSpecific.mjs')
    const metaUrlFilePath = module.getImportMetaUrlFilePath()
    const directory = path.dirname(metaUrlFilePath)
    return path.normalize(directory)
  }
  return __dirname
}

export function validateFindFilesRecursivelyParams(dir: string, filenamePattern: string) {
  requireValidPath('dir', dir)
  requireString('pattern', filenamePattern)

  if (filenamePattern.length > 50) {
    throw new Error(`filenamePattern param must have fewer than 50 characters`)
  }

  const numWildcards = filenamePattern.replace(/\*+/g, '*').split('*').length - 1
  if (numWildcards > 5) {
    throw new Error(`filenamePattern param must contain 5 or fewer wildcards`)
  }

  if (filenamePattern.includes('/') || filenamePattern.includes('\\')) {
    throw new Error('filenamePattern param must not contain slashes')
  }
}
