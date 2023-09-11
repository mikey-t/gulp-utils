import fsp from 'node:fs/promises'
import { SpawnResult, emptyDirectory, spawnAsync } from './src/generalUtils.js'
import { series, parallel } from 'swig-cli'

const tscPath = './node_modules/typescript/lib/tsc.js'

export const build = series(cleanDist, parallel(buildEsm, buildCjs, copyRunWhileParentAlive))
export const buildEsmOnly = series(cleanDist, buildEsm)
export const buildCjsOnly = series(cleanDist, buildCjs)

async function cleanDist() {
  await emptyDirectory('./dist')
}

async function buildEsm() {
  await throwIfSpawnFails('buildEsm', () => spawnAsync('node', [tscPath, '--p', 'tsconfig.esm.json']))
}

async function buildCjs() {
  await throwIfSpawnFails('buildCjs', () => spawnAsync('node', [tscPath, '--p', 'tsconfig.cjs.json']))
}

async function copyRunWhileParentAlive() {
  await fsp.copyFile('./src/runWhileParentAlive.mjs', './dist/esm/runWhileParentAlive.mjs')
}

async function throwIfSpawnFails(name: string, func: () => Promise<SpawnResult>) {
  const result = await func()
  if (result.code !== 0) {
    throw new Error(`${name} failed with code ${result.code}`)
  }
}
