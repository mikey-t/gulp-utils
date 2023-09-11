import { emptyDirectory, log, spawnAsync } from './src/generalUtils.js'
import { series, parallel } from 'swig-cli'
import fsp from 'node:fs/promises'

const tscPath = './node_modules/typescript/lib/tsc.js'

export const build = series(cleanDist, parallel(buildEsm, buildCjs))
export const buildEsmOnly = series(cleanDist, buildEsm)
export const buildCjsOnly = series(cleanDist, buildCjs)

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
  await copyCjsPackageJson()
}

async function copyCjsPackageJson() {
  await fsp.copyFile('./package.cjs.json', './dist/cjs/package.json')
}
