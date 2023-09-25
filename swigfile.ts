import { emptyDirectory, log, spawnAsync, spawnAsyncLongRunning } from './src/generalUtils.js'
import { series, parallel } from 'swig-cli'
import fsp from 'node:fs/promises'

// Using direct paths to node_modules to skip the startup delay of using npm
const tscPath = './node_modules/typescript/lib/tsc.js'
const eslintPath = './node_modules/eslint/bin/eslint.js'
const typedocPath = './node_modules/typedoc/dist/lib/cli.js'
const baseTestArgs = ['--no-warnings', '--loader', 'tsx']
const testFiles = [
  './test/generalUtils.test.ts',
  './test/findFilesRecursively.test.ts',
  './test/TarballUtility.test.ts',
  // These only work on windows and are quite slow - uncomment this to run them only when making changes to certUtils.ts
  // './test/certUtils.test.ts', 
]

export const build = series(cleanDist, parallel(buildEsm, series(buildCjs, copyCjsPackageJson)))
export const buildEsmOnly = series(cleanDist, buildEsm)
export const buildCjsOnly = series(cleanDist, buildCjs)

export async function lint() {
  await spawnAsync('node', [eslintPath, '--ext', '.ts', './src', './test'], { throwOnNonZero: true })
}

export async function genDocs() {
  await spawnAsync('node', [typedocPath], { throwOnNonZero: true })
}

export async function test() {
  if ((await spawnAsync('node', [...baseTestArgs, '--test', ...testFiles])).code !== 0) {
    throw new Error('Tests failed')
  }
}

export async function testWatch() {
  const args = [...baseTestArgs, '--test', '--watch', ...testFiles]
  if ((await spawnAsyncLongRunning('node', args)).code !== 0) {
    throw new Error('Tests failed')
  }
}

export async function testOnly() {
  const args = [...baseTestArgs, '--test-only', '--test', ...testFiles]
  if ((await spawnAsync('node', args)).code !== 0) {
    throw new Error('Tests failed')
  }
}

export async function testOnlyWatch() {
  const args = [...baseTestArgs, '--test-only', '--test', '--watch', ...testFiles]
  if ((await spawnAsyncLongRunning('node', args)).code !== 0) {
    throw new Error('Tests failed')
  }
}

export async function cleanDist() {
  await emptyDirectory('./dist')
}

async function buildEsm() {
  log('Building ESM')
  await spawnAsync('node', [tscPath, '--p', 'tsconfig.esm.json'], { throwOnNonZero: true })
}

async function buildCjs() {
  log('Building CJS')
  await spawnAsync('node', [tscPath, '--p', 'tsconfig.cjs.json'], { throwOnNonZero: true })
}

async function copyCjsPackageJson() {
  await fsp.copyFile('./package.cjs.json', './dist/cjs/package.json')
}
