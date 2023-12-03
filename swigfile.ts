import 'dotenv/config'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parallel, series } from 'swig-cli'
import { winHasElevatedPerms } from './src/DependencyChecker.js'
import { config } from './src/NodeCliUtilsConfig.js'
import { ensureDockerRunning, spawnDockerCompose } from './src/dockerUtils.js'
import { Emoji, copyNewEnvValues, emptyDirectory, findFilesRecursively, isPlatformWindows, log, spawnAsync, spawnAsyncLongRunning, trace, withRetryAsync } from './src/generalUtils.js'
import { httpGet } from './src/generalUtilsInternal.js'

config.traceEnabled = false

// Using direct paths to node_modules to skip the startup delay of using npm
const tscPath = './node_modules/typescript/lib/tsc.js'
const eslintPath = './node_modules/eslint/bin/eslint.js'
const typedocPath = './node_modules/typedoc/dist/lib/cli.js'
const c8Path = './node_modules/c8/bin/c8.js'
const loaderArgsTsx = ['--no-warnings', '--import', 'tsx']
const loaderArgsTsNode = ['--no-warnings', '--experimental-loader', 'ts-node/esm'] // Needed ts-node instead of tsx for more accurate test coverage
const dockerComposePath = './docker-compose.yml'
const docsProjectPath = '../node-cli-utils-docs'
const envKeySonarToken = 'SONAR_TOKEN'
const envKeySonarPort = 'SONAR_PORT'

export const build = series(cleanDist, parallel(buildEsm, series(buildCjs, copyCjsPackageJson)))
export const buildEsmOnly = series(cleanDist, buildEsm)
export const buildCjsOnly = series(cleanDist, buildCjs)

export async function lint() {
  await spawnAsync('node', [eslintPath, '--ext', '.ts', './src', './test', './swigfile.ts'], { throwOnNonZero: true })
}

// See DevNotes.md for documentation and examples
export async function test(fullOverride = false) {
  const normalTestFiles = await getTestFilesByCategory('normal')
  const integrationTestFiles = await getTestFilesByCategory('integration')
  const certTestFile = './test/categories/other/certUtils.test.ts'
  const tarTestFile = './test/categories/other/TarballUtility.test.ts'

  const isFullTest = argPassed('full') || fullOverride

  const testFiles: string[] = []

  if (isFullTest || argPassed('i')) {
    testFiles.push(...integrationTestFiles)
  }
  if (isFullTest || argPassed('cert')) {
    if (!isPlatformWindows()) {
      throw new Error(`cert tests cannot run on a non-windows platform`)
    }
    if (!await winHasElevatedPerms()) {
      throw new Error(`cert tests cannot be run without elevated permissions`)
    }
    testFiles.push(certTestFile)
  }
  if (isFullTest || argPassed('tar')) {
    testFiles.push(tarTestFile)
  }
  if (isFullTest || argPassed('n') || testFiles.length === 0) {
    testFiles.push(...normalTestFiles)
  }

  const isWatch = argPassed('w') && !isFullTest
  const isOnly = argPassed('o')
  const isCoverage = argPassed('c') || isFullTest

  if (isWatch && isCoverage) {
    log(`${Emoji.Warning} The coverage option (c) cannot be used with the watch option (w) - coverage will not be collected`)
  }

  const loaderArgs = isCoverage && !isWatch ? loaderArgsTsNode : loaderArgsTsx
  const args = [...loaderArgs, ...(isOnly ? ['--test-only'] : []), '--test', ...(isWatch ? ['--watch'] : []), ...testFiles]

  trace('test files:', testFiles)


  if (isWatch) {
    trace('args:', args)
    if ((await spawnAsyncLongRunning('node', args)).code !== 0) {
      throw new Error('Tests failed')
    }
  } else {
    if (isCoverage) {
      args.unshift(c8Path, 'node')
    }
    trace('args:', args)
    if ((await spawnAsync('node', args, isCoverage ? { env: { ...process.env, NODE_V8_COVERAGE: './coverage' } } : {})).code !== 0) {
      throw new Error('Tests failed')
    }
    if (isCoverage) {
      log(`${Emoji.Info} Coverage html report: ${pathToFileURL(path.join(process.cwd(), './coverage/lcov-report/index.html'))}`)
    }
  }
}

export async function cleanDist() {
  await emptyDirectory('./dist')
}

export const dockerUp = series(
  syncEnvFile,
  ensureDockerRunning,
  ['dockerUp', () => spawnDockerCompose(dockerComposePath, 'up')],
  printSonarQubeUrl
)

export const dockerUpAttached = series(
  syncEnvFile,
  ensureDockerRunning,
  ['dockerUpAttached', () => spawnDockerCompose(dockerComposePath, 'up', { attached: true })],
  printSonarQubeUrl
)

export const dockerDown = series(
  syncEnvFile,
  ensureDockerRunning,
  ['dockerDown', () => spawnDockerCompose(dockerComposePath, 'down')],
  printSonarQubeUrl
)

export const scan = series(
  dockerUp,
  waitForSonarReadiness,
  ['scan', () => spawnDockerCompose(dockerComposePath, 'run', { args: ['sonar-scanner'], attached: true })],
  printSonarQubeUrl
)

export const bashIntoSonar = series(
  syncEnvFile,
  ['bashIntoSonar', () => spawnDockerCompose(dockerComposePath, 'exec', { args: ['-it', 'sonarqube', 'bash'], attached: true })]
)

export async function watch() {
  await spawnAsyncLongRunning('node', [tscPath, '--p', 'tsconfig.esm.json', '--watch'])
}

export async function watchCjs() {
  await spawnAsyncLongRunning('node', [tscPath, '--p', 'tsconfig.cjs.json', '--watch'])
}

export const publishCheck = series(
  syncEnvFile,
  lint,
  build,
  ['test', () => test(true)],
  scan
)

// Note that the test command is evaluating extra params, so those params will be respected by the test step in this command.
// For example, if you changed something small or you already ran the prePublish command, then you may want to just run "swig publish",
// but if you changed more and want new coverage to be generated, you could run this from an elevated prompt: "swig publish full".
export const publish = series(
  lint,
  build,
  test,
  ['npmPublish', () => spawnAsync('npm', ['publish', '--registry=https://registry.npmjs.org/'], { throwOnNonZero: true })]
)

export const publishDocs = series(
  throwIfNoDocsProject,
  lint,
  build,
  genDocs,
  ['publishDocs', () => spawnAsync('swig', ['publish'], { throwOnNonZero: true, cwd: docsProjectPath })]
)

export async function genDocs() {
  log(`${Emoji.Warning} This does not publish the docs. If you want to both build and publish docs with one command, run this instead: swig publishDocs`)
  await spawnAsync('node', [typedocPath], { throwOnNonZero: true })
}

export async function sonarHealth() {
  const sonarApiToken = process.env[envKeySonarToken]
  const sonarPort = process.env[envKeySonarPort] ?? '9000'
  const headers = { 'Authorization': `Basic ${Buffer.from(`${sonarApiToken}:`).toString('base64')}` }
  const healthCheckUrl = `http://localhost:${sonarPort}/api/system/health`
  const response = await httpGet(healthCheckUrl, headers)
  log(response)
}

// Run "npm pack" so that consuming project's package.json can reference the tarball like this:
// "@mikeyt23/node-cli-utils": "file:../node-cli-utils/mikeyt23-node-cli-utils-2.0.20.tgz"
// Useful as an alternative to "npm link" for chaining multiple packages (which Volta doesn't seem to allow).
export async function pack() {
  await spawnAsync('npm', ['pack'], { throwOnNonZero: true })
}

// Repro issue where first time dotnet message breaks parsing of command output in getDotnetToolInstalledVersion function
export async function deleteDotnetFirstUseSentinel() {
  const dotnetVersion = '8.0.100'
  const firstTimeDotnetFile = path.join(os.homedir(), `.dotnet/${dotnetVersion}.dotnetFirstUseSentinel`)
  log(`deleting file if it exists: ${firstTimeDotnetFile}`)
  if (fs.existsSync(firstTimeDotnetFile)) {
    await fsp.rm(firstTimeDotnetFile)
    log(`deleted`)
  } else {
    log(`file does not exist - exiting`)
  }
}

async function syncEnvFile() {
  copyNewEnvValues('.env.template', '.env')
}

async function buildWithTsconfig(tsconfigFlavor: 'esm' | 'cjs') {
  const tsconfigName = `tsconfig.${tsconfigFlavor}.json`
  log(`Building with ${tsconfigName}`)
  await spawnAsync('node', [tscPath, '--p', tsconfigName], { throwOnNonZero: true })
}

async function buildEsm() {
  await buildWithTsconfig('esm')
}

async function buildCjs() {
  await buildWithTsconfig('cjs')
}

async function copyCjsPackageJson() {
  await fsp.copyFile('./package.cjs.json', './dist/cjs/package.json')
}

async function printSonarQubeUrl() {
  console.log(`SonarQube url: http://localhost:${process.env.SONAR_PORT || 9000}`)
}

async function throwIfNoDocsProject() {
  if (!fs.existsSync(path.join(docsProjectPath, 'swigfile.ts'))) {
    throw new Error(`You don't have the docs project repository on your machine - expecting it to be here: ${docsProjectPath}`)
  }
}

async function getTestFilesByCategory(category: string): Promise<string[]> {
  const testDir = `./test/categories/${category}`
  if (!fs.existsSync(testDir)) {
    throw new Error(`Cannot retrieve test files - path does not exist: ${testDir}`)
  }
  return (await findFilesRecursively(testDir, '*.test.ts', { returnForwardSlashRelativePaths: true }))
    .map(f => path.join(testDir, f))
}

function argPassed(argName: string) {
  return process.argv.slice(3).includes(argName)
}

async function waitForSonarReadiness() {
  const sonarToken = process.env[envKeySonarToken]
  if (!sonarToken || sonarToken === 'your_sonar_token') {
    throw new Error(`You are missing the environment variable "${envKeySonarToken}" - if this is a first run, you will need to generate an API key and add it to your .env (see DevNotes.md)`)
  }

  log('running initial check to see if sonar is up')
  if (await isSonarReady()) {
    log('sonar is ready')
    return
  }

  const maxAttempts = 5
  const retryDelayMillis = 2000
  const initialDelayMillis = 15000
  log(`sonar is not ready, waiting ${initialDelayMillis} milliseconds and then retrying every ${retryDelayMillis} milliseconds (${maxAttempts} max attempts)`)
  await withRetryAsync(throwIfSonarNotReady, maxAttempts, retryDelayMillis, { initialDelayMilliseconds: initialDelayMillis, traceEnabled: true })
}

async function isSonarReady(): Promise<boolean> {
  try {
    const sonarApiToken = process.env[envKeySonarToken]
    const sonarPort = process.env[envKeySonarPort] ?? '9000'

    const headers = { 'Authorization': `Basic ${Buffer.from(`${sonarApiToken}:`).toString('base64')}` }
    const healthCheckUrl = `http://localhost:${sonarPort}/api/system/health`

    log(`attempting to hit sonar health check url: ${healthCheckUrl}`)

    const response = await httpGet(healthCheckUrl, headers)
    if (!response.ok) {
      log('sonar health check endpoint returned an http error code: ', response)
      return false
    }

    if (response.body.includes('Insufficient privileges')) {
      log('Sonar health check returned an error indicating the token is wrong - verify your token in .env matches the one you setup in the Sonar UI')
      process.exit(1)
    }

    const data = JSON.parse(response.body)
    if (data.health !== 'GREEN') {
      log(`Sonar is not ready - health check response: ${JSON.stringify(data)}`)
      return false
    }

    return true
  } catch (err) {
    return false
  }
}

async function throwIfSonarNotReady(): Promise<void> {
  if (!await isSonarReady()) {
    throw new Error(`Sonar is not ready`)
  }
}
