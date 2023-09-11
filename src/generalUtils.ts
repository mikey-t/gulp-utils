import { ChildProcess, SpawnOptions, exec, spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fsp from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import tar, { CreateOptions, FileOptions } from 'tar'
import { platform } from 'node:os'
import * as readline from 'readline'
import { config } from './NodeCliUtilsConfig.js'

const isCommonJS = typeof require === "function" && typeof module === "object" && module.exports
const isEsm = !isCommonJS

export function log(message?: unknown, ...optionalParams: unknown[]) {
  console.log(message, ...optionalParams)
}

export function trace(message?: unknown, ...optionalParams: unknown[]) {
  if (config.traceEnabled) {
    const prefix = `[TRACE]`
    console.log(prefix, message, ...optionalParams)
  }
}

export type StringKeyedDictionary = { [name: string]: string }

/**
 * Options for the spawnAsync wrapper function for NodeJS spawn.
 */
export interface SpawnResult {
  /**
   * The exit code of the spawned process. Rather than allowing null, this will be set to 1 if the process exits with null, or 0 if user cancels with ctrl+c.
   */
  code: number
  /**
   * The stdout of the spawned process. **Warning:** this will be empty by default without changing SpawnOptions stdio (see {@link spawnAsync}).
   */
  stdout: string
  /**
   * The stderr of the spawned process. **Warning:** this will be empty by default without changing SpawnOptions stdio (see {@link spawnAsync}).
   */
  stderr: string
  /**
   * Not an error from the child process stderr, but rather an error thrown when attempting to spawn the child process.
   */
  error?: Error,
  /**
   * The current working directory of the spawned process. Not changed by method, so just repeating your SpawnOptions.cwd back to you, but helpful for debugging.
   */
  cwd?: string
}

// I know it's weird that SimpleSpawnResult has more props then SpawnResult... didn't want to pollute spawnAsync anymore than it already has been.
export interface SimpleSpawnResult extends SpawnResult {
  stdoutLines: string[]
}

export interface WhichResult {
  location: string | undefined
  additionalLocations: string[] | undefined
  error: Error | undefined
}

export type DockerComposeCommand = 'build' | 'config' | 'cp' | 'create' | 'down' | 'events' | 'exec' | 'images' | 'kill' | 'logs' | 'ls' | 'pause' | 'port' | 'ps' | 'pull' | 'push' | 'restart' | 'rm' | 'run' | 'start' | 'stop' | 'top' | 'unpause' | 'up' | 'version'

const dockerComposeCommandsThatSupportDetached = ['exec', 'logs', 'ps', 'restart', 'run', 'start', 'stop', 'up']

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function getCurrentModuleDir(): string {
  // @ts-ignore
  if (isEsm) {
    // @ts-ignore
    const directory = fileURLToPath(new URL('.', import.meta.url))
    return path.normalize(directory)
  }
  return __dirname
}

/**
 * This is a wrapper function for NodeJS spawn that provides some additional functionality:
 * - If isLongRunning is true and the method is run on Windows, a workaround is used to prevent orphaned processes
 * - Defaults stdio to inherit so that output is visible in the console, but note that this means stdout and stderr will not be available in the returned SpawnResult
 * @param command The command to spawn
 * @param args The arguments to pass to the command
 * @param options The options to pass to the command
 * @param isLongRunning This optional param being true in combination with the platform being windows will cause a workaround to prevent orphaned processes
 * @returns A Promise that resolves to a {@link SpawnResult}
 */
export async function spawnAsync(command: string, args?: string[], options?: SpawnOptions, isLongRunning?: boolean): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    try {
      const defaultSpawnOptions: SpawnOptions = { stdio: 'inherit' }
      // const defaultSpawnOptions: SpawnOptions = { stdio: 'pipe' }
      const argsToUse = args ?? []
      const logPrefix = `[${command} ${argsToUse.join(' ')}] `
      const mergedOptions = { ...defaultSpawnOptions, ...options }
      const result: SpawnResult = {
        code: 1,
        stdout: '',
        stderr: '',
        cwd: mergedOptions.cwd?.toString() ?? process.cwd()
      }

      // Windows has a bug where child processes are orphaned when using the shell option. This workaround will spawn
      // a "middle" process using the shell option to check whether parent process is still running at intervals and if not, kill the child process tree.
      const workaroundCommand = 'node'
      const workaroundScript = path.join(getCurrentModuleDir(), 'runWhileParentAlive.js')
      if (isLongRunning && isPlatformWindows() && command !== workaroundCommand && argsToUse[0] !== workaroundScript) {
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
          workaroundScript,
          loggingEnabledString,
          traceEnabledString,
          pollingMillisString,
          command,
          ...(args ?? [])
        ]

        spawnAsync(workaroundCommand, workaroundArgs, { ...mergedOptions, stdio: 'inherit', shell: true })
          .then((workaroundResult) => {
            result.code = workaroundResult.code
            resolve(result)
          }).catch((err) => {
            reject(err)
          })

        return
      }

      const child = spawn(command, argsToUse, mergedOptions)
      const childId: number | undefined = child.pid
      if (childId === undefined) {
        throw new Error(`${logPrefix}ChildProcess pid is undefined - spawn failed`)
      }

      // This will only happen when stdio is not set to 'inherit'
      child.stdout?.on('data', (data) => {
        process.stdout.write(data)
        result.stdout += data.toString()
      })

      // This will only happen when stdio is not set to 'inherit'
      child.stderr?.on('data', (data) => {
        process.stdout.write(data)
        result.stderr += data.toString()
      })

      const listener = new SignalListener(child, logPrefix)

      child.on('exit', (code, signal) => {
        const signalMessage = signal ? ` with signal ${signal}` : ''
        trace(`${logPrefix}ChildProcess exited with code ${code}${signalMessage}`)
        // If long running, ctrl+c will cause null, which we don't necessarily want to consider an error
        result.code = (code === null && isLongRunning) ? 0 : code ?? 1
        child.removeAllListeners()
        listener.detach()
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

/**
 * Ensure the directory exists. Similar to `mkdir -p` (creates parent directories if they don't exist).
 * @param dir The directory to ensure exists. If it does not exist, it will be created.
 */
export async function ensureDirectory(dir: string) {
  requireString('dir', dir)
  if (!fs.existsSync(dir)) {
    await mkdirp(dir)
  }
}

/**
 * Create a directory. Will create parent directory structure if it don't exist. Similar to `mkdir -p`.
 * @param dir The directory to create. 
 */
export async function mkdirp(dir: string) {
  await fsp.mkdir(dir, { recursive: true })
}

/**
 * Empties a directory of all files and subdirectories.
 * 
 * Optionally skips files and directories at the top level.
 * @param directoryToEmpty The directory to empty.
 * @param fileAndDirectoryNamesToSkip An optional array of file and directory names to skip, but only at the top level of the directoryToEmpty.
 */
export async function emptyDirectory(directoryToEmpty: string, fileAndDirectoryNamesToSkip?: string[]) {
  requireString('directoryToEmpty', directoryToEmpty)

  if (!fs.existsSync(directoryToEmpty)) {
    trace(`directoryToEmpty does not exist - creating directory ${directoryToEmpty}`)
    await mkdirp(directoryToEmpty)
    return
  }

  if (!fs.lstatSync(directoryToEmpty).isDirectory()) {
    throw new Error(`directoryToEmpty is not a directory: ${directoryToEmpty}`)
  }

  // Add some guardrails to prevent accidentally emptying the wrong directory
  const absolutePath = path.resolve(directoryToEmpty)
  log(`emptying directory: ${absolutePath}`)
  log(`current working directory: ${process.cwd()}`)
  if (!absolutePath.startsWith(process.cwd())) {
    throw new Error(`directoryToEmpty must be a child of the current working directory: ${directoryToEmpty}`)
  }

  if (absolutePath === process.cwd()) {
    throw new Error(`directoryToEmpty cannot be the current working directory: ${directoryToEmpty}`)
  }

  const dir = await fsp.opendir(directoryToEmpty, { encoding: 'utf-8' })

  if (fileAndDirectoryNamesToSkip && !Array.isArray(fileAndDirectoryNamesToSkip)) {
    throw new Error('fileAndDirectoryNamesToSkip must be an array')
  }

  let dirEntry = await dir.read()

  while (dirEntry) {
    if (fileAndDirectoryNamesToSkip && fileAndDirectoryNamesToSkip.includes(dirEntry.name)) {
      dirEntry = await dir.read()
      continue
    }

    const direntPath = path.join(directoryToEmpty, dirEntry.name)

    if (dirEntry.isDirectory()) {
      await fsp.rmdir(direntPath, { recursive: true })
    } else {
      await fsp.unlink(direntPath)
    }

    dirEntry = await dir.read()
  }

  await dir.close()
}

/**
 * Copies the contents of a directory to another directory (not including the top-level directory itself).
 * 
 * If the destination directory does not exist, it will be created.
 * @param sourceDirectory Directory to copy from
 * @param destinationDirectory Directory to copy to
 */
export async function copyDirectoryContents(sourceDirectory: string, destinationDirectory: string) {
  requireString('sourceDirectory', sourceDirectory)
  requireString('destinationDirectory', destinationDirectory)

  if (!fs.existsSync(sourceDirectory)) {
    throw new Error(`sourceDirectory directory does not exist: ${sourceDirectory}`)
  }

  if (!fs.lstatSync(sourceDirectory).isDirectory()) {
    throw new Error(`sourceDirectory is not a directory: ${sourceDirectory}`)
  }

  if (!fs.existsSync(destinationDirectory)) {
    await mkdirp(destinationDirectory)
  }

  if (!fs.lstatSync(destinationDirectory).isDirectory()) {
    throw new Error(`destinationDirectory is not a directory: ${destinationDirectory}`)
  }

  const dir = await fsp.opendir(sourceDirectory, { encoding: 'utf-8' })

  let dirEntry = await dir.read()

  while (dirEntry) {
    const sourcePath = path.join(sourceDirectory, dirEntry.name)
    const destPath = path.join(destinationDirectory, dirEntry.name)

    if (dirEntry.isDirectory()) {
      await copyDirectoryContents(sourcePath, destPath)
    } else {
      await fsp.copyFile(sourcePath, destPath)
    }

    dirEntry = await dir.read()
  }
}

export async function dotnetBuild(projectPath: string) {
  requireValidPath('projectPath', projectPath)
  await spawnAsync('dotnet', ['build', projectPath])
}

/**
 * Helper method to spawn a process and run 'dotnet publish'.
 * @param projectPath Path to project file (like .csproj) or directory of project to build
 * @param configuration Build configuration, such as 'Release'
 * @param outputDir The relative or absolute path for the build output
 * @param cwd Optionally run the command from another current working directory
 */
export async function dotnetPublish(projectPath: string = './', configuration: string = 'Release', outputDir: string = 'publish', cwd?: string) {
  requireValidPath('projectPath', projectPath)
  requireString('outputDir', outputDir)
  requireString('configuration', configuration)
  if (cwd) {
    requireValidPath('cwd', cwd)
  }
  const args = ['publish', projectPath, '-c', configuration, '-o', outputDir]
  trace(`running dotnet ${args.join(' ')}${cwd ? ` in cwd ${cwd}` : ''}`)
  await spawnAsync('dotnet', args, { cwd: cwd })
}

export function requireString(paramName: string, paramValue: string) {
  if (paramValue === undefined || paramValue === null || paramValue === '') {
    throw new Error(`Required param '${paramName}' is missing`)
  }
  if (typeof paramValue !== 'string') {
    throw new Error(`Required param '${paramName}' is not a string`)
  }
}

export function requireValidPath(paramName: string, paramValue: string) {
  requireString(paramName, paramValue)

  if (!fs.existsSync(paramValue)) {
    throw new Error(`Invalid or nonexistent path provided for param '${paramName}': ${paramValue}`)
  }
}

/**
 * Creates a tarball from a directory.
 * @param directoryToTarball The directory to tarball. The directory name will be used as the root directory in the tarball
 * @param tarballPath The path to the tarball to create. Must end with '.tar.gz'
 * @param omitFiles An optional array of file names to omit from the tarball
 */
export async function createTarball(directoryToTarball: string, tarballPath: string, omitFiles?: string[]): Promise<void> {
  requireValidPath('directoryToTarball', directoryToTarball)
  requireString('tarballPath', tarballPath)

  if (tarballPath.endsWith('.tar.gz') === false) {
    throw new Error(`tarballPath must end with '.tar.gz': ${tarballPath}`)
  }

  const directoryToTarballParentDir = path.dirname(directoryToTarball)
  const directoryToTarballName = path.basename(directoryToTarball)

  const outputDirectory = path.dirname(tarballPath)
  const tarballName = path.basename(tarballPath)

  if (!fs.existsSync(outputDirectory)) {
    trace(`tarballPath directory does not exist - creating '${outputDirectory}'`)
    await mkdirp(outputDirectory)
  } else if (fs.existsSync(tarballPath)) {
    trace(`removing existing tarball '${tarballName}' before creating new one`)
    await fsp.unlink(tarballPath)
  }

  const filesToOmit = omitFiles ?? []

  const options: CreateOptions & FileOptions = {
    gzip: true,
    file: tarballPath,
    cwd: directoryToTarballParentDir,
    filter: (filePath: string) => !filesToOmit.includes(path.basename(filePath))
  }
  const fileList: ReadonlyArray<string> = [directoryToTarballName]
  await (tar.create as (options: CreateOptions & FileOptions, fileList: ReadonlyArray<string>) => Promise<void>)(options, fileList)

  trace('tarball created: ' + tarballPath)
}

/**
 * Options for the spawnDockerCompose wrapper function for `docker compose`.
 * @param args        Additional arguments to pass to the docker-compose command
 * @param projectName Pass the same projectName for each commands for the same project to ensure your containers get unique, descriptive and consistent names.
 *                    Note that there are other better options such as using the environment variable `COMPOSE_PROJECT_NAME`. See https://docs.docker.com/compose/environment-variables/envvars/#compose_project_name.
 * @param attached    Default: false. All commands that support the detached option wil use it unless attached is specified as true (-d support: exec, logs, ps, restart, run, start, stop, up)
 * @param useDockerComposeFileDirectoryAsCwd Default: false. If true, the docker compose command will be run in the directory containing the docker compose file.
 */
export interface DockerComposeOptions {
  args?: string[]
  projectName?: string
  attached?: boolean
  useDockerComposeFileDirectoryAsCwd?: boolean
}

/**
 * For docker compose commands, see https://docs.docker.com/compose/reference/.
 * @param dockerComposePath Path to docker-compose.yml
 * @param dockerComposeCommand The docker-compose command to run
 * @param options {@link DockerComposeOptions} to use, including additional arguments to pass to the docker compose command and the project name
 */
export async function spawnDockerCompose(dockerComposePath: string, dockerComposeCommand: DockerComposeCommand, options?: DockerComposeOptions): Promise<void> {
  requireValidPath('dockerComposePath', dockerComposePath)
  requireString('dockerComposeCommand', dockerComposeCommand)

  const useDockerComposeFileDirectoryAsCwd = options && options.useDockerComposeFileDirectoryAsCwd

  if (await isDockerRunning() === false) {
    throw new Error('Docker is not running')
  }

  const defaultOptions: DockerComposeOptions = { attached: false }
  const mergedOptions = { ...defaultOptions, ...options }

  const dockerComposeDir = path.dirname(dockerComposePath)
  const dockerComposeFilename = path.basename(dockerComposePath)

  const spawnCommand = 'docker'
  let spawnArgs = ['compose', '-f', useDockerComposeFileDirectoryAsCwd ? dockerComposeFilename : dockerComposePath]

  if (mergedOptions.projectName) {
    spawnArgs.push('--project-name', mergedOptions.projectName)
  }

  spawnArgs.push(dockerComposeCommand)

  if (!mergedOptions.attached && dockerComposeCommandsThatSupportDetached.includes(dockerComposeCommand)) {
    spawnArgs.push('-d')
  }

  if (mergedOptions.args) {
    spawnArgs = spawnArgs.concat(mergedOptions.args)
  }

  const dockerCommandString = `docker ${spawnArgs.join(' ')}`
  const traceMessage = useDockerComposeFileDirectoryAsCwd ?
    `running command in ${dockerComposeDir}: ${dockerCommandString}` :
    `running command: ${dockerCommandString}`

  trace(traceMessage)

  const longRunning = dockerComposeCommandsThatSupportDetached.includes(dockerComposeCommand) && options && options.attached

  const spawnResult = await spawnAsync(spawnCommand, spawnArgs, { cwd: useDockerComposeFileDirectoryAsCwd ? dockerComposeDir : process.cwd(), shell: true }, longRunning)

  if (spawnResult.code !== 0) {
    throw new Error(`docker compose command failed with code ${spawnResult.code}`)
  }
}

/**
 * Splits a string into lines, removing empty lines and carriage return characters.
 * @param str String to split into lines
 * @returns An array of lines from the string, with empty lines removed
 */
export function stringToNonEmptyLines(str: string): string[] {
  if (!str) { return [] }
  return str.split('\n').filter(line => line && line.trim()).map(line => line.replace('\r', ''))
}

/**
 * Runs the requested command using NodeJS spawnSync wrapped in an outer Windows CMD.exe command and returns the result with stdout split into lines.
 * 
 * Use this for simple quick commands that don't require a lot of control.
 * 
 * For commands that aren't Windows and CMD specific, use {@link getSimpleSpawnResultSync}.
 * @param command Command to run
 * @param args Arguments to pass to the command
 * @returns An object with the status code, stdout, stderr, and error (if any)
 */
export function getSimpleCmdResultSync(command: string, args?: string[]): SimpleSpawnResult {
  if (!isPlatformWindows()) {
    throw new Error('getCmdResult is only supported on Windows')
  }
  return getSimpleSpawnResultSync('cmd', ['/D', '/S', '/C', command, ...(args ?? [])])
}

/**
 * Runs the requested command using NodeJS spawnSync and returns the result with stdout split into lines.
 * 
 * Use this for simple quick commands that don't require a lot of control.
 * 
 * For commands that are Windows and CMD specific, use {@link getSimpleCmdResultSync}.
 * @param command Command to run
 * @param args Arguments to pass to the command
 * @returns An object with the status code, stdout, stderr, and error (if any)
 */
export function getSimpleSpawnResultSync(command: string, args?: string[]): SimpleSpawnResult {
  requireString('command', command)
  const result = spawnSync(command, args ?? [], { encoding: 'utf-8' })
  return {
    code: result.status ?? 1,
    stdout: result.stdout.toString(),
    stderr: result.stdout.toString(),
    stdoutLines: stringToNonEmptyLines(result.stdout.toString()),
    error: result.error,
    cwd: process.cwd()
  }
}

export function isPlatformWindows() {
  return platform() === 'win32'
}

export function isPlatformMac() {
  return platform() === 'darwin'
}

export function isPlatformLinux() {
  return !isPlatformWindows() && !isPlatformMac()
}

export function whichSync(commandName: string): WhichResult {
  if (isPlatformWindows()) {
    const result = getSimpleCmdResultSync('where', [commandName])
    return {
      location: result.stdoutLines[0],
      additionalLocations: result.stdoutLines.slice(1),
      error: result.error
    }
  } else {
    const result = getSimpleSpawnResultSync('which', ['-a', commandName])
    return {
      location: result.stdoutLines[0],
      additionalLocations: result.stdoutLines.slice(1),
      error: result.error
    }
  }
}

export async function isDockerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('docker info', (error, stdout) => {
      if (error) {
        resolve(false)
      } else {
        if (!stdout || stdout.includes('error during connect')) {
          resolve(false)
        } else {
          resolve(true)
        }
      }
    })
  })
}

export function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise(resolve =>
    rl.question(`\n${query}\n`, ans => {
      rl.close()
      resolve(ans)
    })
  )
}

export function getConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`\n  ❓ ${question}\n  ➡️ Proceed? (yes/no): `, (answer) => {
      rl.close()
      const confirmed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'
      log(confirmed ? '  ✅ Proceeding\n' : '  ❌ Aborting\n')
      resolve(confirmed)
    })
  })
}

export async function getConfirmationExample() {
  if (await getConfirmation('Do you even?')) {
    log('you do even')
  } else {
    log('you do not even')
  }
}

export async function installOrUpdateDotnetEfTool() {
  const installed = whichSync('dotnet-ef').location
  if (installed) {
    log('dotnet-ef tool already installed, updating...')
  } else {
    log('dotnet-ef tool not installed, installing...')
  }
  const args = ['tool', installed ? 'update' : 'install', '--global', 'dotnet-ef']
  await spawnAsync('dotnet', args)
}

export async function configureDotnetDevCerts() {
  await spawnAsync('dotnet', ['dev-certs', 'https', '--clean'])
  await spawnAsync('dotnet', ['dev-certs', 'https', '-t'])
}

/**
 * Copy entries from a source .env file to a destination .env file for which the destination .env file does not already have entries.
 * If the destination .env file does not exist, it will be created and populated with the source .env file's values.
 * 
 * This is useful for copying values from a .env.template file to a root .env file.
 * 
 * For copying root .env files to other locations, use {@link overwriteEnvFile}.
 * @param sourcePath The path to the source .env file such as a `.env.template` file (use {@link overwriteEnvFile} for copying root .env files to other locations)
 * @param destinationPath The path to the destination .env file, such as the root .env file
 */
export async function copyNewEnvValues(sourcePath: string, destinationPath: string) {
  await copyEnv(sourcePath, destinationPath, false)
}

/**
 * Copy entries from a source .env file to a destination .env file, overwriting any existing entries in the destination .env file.
 * If the destination .env file does not exist, it will be created and populated with the source .env file's values.
 * 
 * This is useful for copying values from a root .env file to additional locations (server, client, docker-compose directory, etc.)
 * throughout your solution so you only have to manage one .env file.
 * 
 * Note that this does not delete any existing entries in the destination .env file, which is useful if you have additional entries in
 * the destination .env file that you don't want to overwrite.
 * 
 * For copying .env.template files to root .env files, use {@link copyNewEnvValues}.
 * @param sourcePath The path to the source .env file such as a root .env file (use {@link copyNewEnvValues} for .env.template files)
 * @param destinationPath The path to the destination .env file
 * @param suppressAddKeysMessages If true, messages about adding missing keys will not be logged (useful if you're always calling {@link copyModifiedEnv} after this call)
 */
export async function overwriteEnvFile(sourcePath: string, destinationPath: string, suppressAddKeysMessages = false) {
  await copyEnv(sourcePath, destinationPath, true, suppressAddKeysMessages)
}

/**
 * Copy entries from a source .env file to a destination .env file, but only for the keys specified in keepKeys.
 * Will also modify entries in the destination .env file as specified in modifyEntries.
 * @param sourcePath The path to the source .env file
 * @param destinationPath The path to the destination .env file
 * @param keepKeys The keys to keep from the source .env file
 * @param modifyEntries The entries to modify in the destination .env file
 */
export async function copyModifiedEnv(sourcePath: string, destinationPath: string, keepKeys: string[], modifyEntries?: StringKeyedDictionary) {
  requireValidPath('sourcePath', sourcePath)
  const destPathDir = path.dirname(destinationPath)
  if (!fs.existsSync(destPathDir)) {
    await ensureDirectory(destPathDir)
  }

  const sourceDict = getEnvAsDictionary(sourcePath)
  const newDict: StringKeyedDictionary = filterDictionary(sourceDict, key => keepKeys.includes(key))

  if (modifyEntries && Object.keys(modifyEntries).length > 0) {
    for (const [key, value] of Object.entries(modifyEntries)) {
      newDict[key] = value
    }
  }

  const newSortedDict = sortDictionaryByKeyAsc(newDict)
  const newEnvFileContent = dictionaryToEnvFileString(newSortedDict)
  await fsp.writeFile(destinationPath, newEnvFileContent)
}

async function copyEnv(sourcePath: string, destinationPath: string, overrideExistingDestinationValues = true, suppressAddKeysMessages = false) {
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

function getEnvAsDictionary(envPath: string): StringKeyedDictionary {
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

function dictionaryToEnvFileString(dict: StringKeyedDictionary): string {
  return Object.entries(dict).map(kvp => `${kvp[0]}=${kvp[1]}`).join('\n') + '\n'
}

/**
 * Filters a dictionary by key.
 * @param dict The dictionary to filter
 * @param predicate A function that returns true if the key should be included in the filtered dictionary
 * @returns A new dictionary with only the keys that passed the predicate
 */
export function filterDictionary(dict: StringKeyedDictionary, predicate: (key: string) => boolean): StringKeyedDictionary {
  // Notes to self:
  // - The second param of reduce is the initial value of the accumulator
  // - Reduce processes each element of the array and returns the accumulator for the next iteration
  // - In our case, the accumulator is a new dictionary that we're building up
  return Object.keys(dict)
    .filter(predicate)
    .reduce((accumulator, key) => {
      accumulator[key] = dict[key]
      return accumulator
    }, {} as StringKeyedDictionary)
}

/**
 * Sorts a dictionary by key in ascending order.
 * @param dict The dictionary to sort
 * @returns A new dictionary sorted by key in ascending order
 */
export function sortDictionaryByKeyAsc(dict: StringKeyedDictionary): StringKeyedDictionary {
  const newSortedDict = Object.entries(dict).sort((a, b) => {
    if (a < b) {
      return -1
    }
    if (a > b) {
      return 1
    }
    return 0
  })

  return Object.fromEntries(newSortedDict)
}

/**
 * Helper method to delete a .env file if it exists.
 * @param envPath The path to the .env file to delete
 */
export async function deleteEnvIfExists(envPath: string) {
  // Just protecting ourselves from accidentally deleting something we didn't mean to
  if (envPath.endsWith('.env') === false) {
    throw new Error(`envPath must end with '.env': ${envPath}`)
  }
  // Using fsp.unlink will throw an error if it's a directory
  if (fs.existsSync(envPath)) {
    await fsp.unlink(envPath)
  }
}
