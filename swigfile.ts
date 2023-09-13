import { emptyDirectory, log, spawnAsync } from './src/generalUtils.js'
import { series, parallel } from 'swig-cli'
import fsp from 'node:fs/promises'

// Using direct paths to local tsc to skip the startup delay of using npm
const tscPath = './node_modules/typescript/lib/tsc.js'
const typedocPath = './node_modules/typedoc/dist/lib/cli.js'

export const build = series(cleanDist, parallel(buildEsm, series(buildCjs, copyCjsPackageJson)))
export const buildEsmOnly = series(cleanDist, buildEsm)
export const buildCjsOnly = series(cleanDist, buildCjs)

export async function genDocs() {
  await spawnAsync('node', [typedocPath], { throwOnNonZero: true })
}

async function cleanDist() {
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
