import { log } from 'node:console'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

export async function deletePnpmDir(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    log(`- deleting: ${dirPath}`)
    await fsp.rm(dirPath, { recursive: true })
  } else {
    log(`- not found: ${dirPath}`)
  }
}

export async function removePnpmFromUserPlatformJson(voltaAppDir: string) {
  log(`- removing pnpm from platform.json in ${voltaAppDir}`)
  const platformJsonPath = path.join(voltaAppDir, 'tools/user/platform.json')
  if (!fs.existsSync(platformJsonPath)) {
    throw new Error(`platform.json does not exist at ${platformJsonPath}`)
  }
  const platformJsonData = await fsp.readFile(platformJsonPath, 'utf-8')
  const platformJson = JSON.parse(platformJsonData)
  if (platformJson.pnpm) {
    delete platformJson.pnpm
    await fsp.writeFile(platformJsonPath, JSON.stringify(platformJson, null, 2), 'utf-8')
    log('- removed pnpm from platform.json')
  } else {
    log('- pnpm not found in platform.json')
  }
}

export function getVoltaAppDir() {
  const localAppDataDir = process.env.LOCALAPPDATA
  if (!localAppDataDir) {
    throw new Error('Env var LOCALAPPDATA is undefined')
  }
  log(`- path to LOCALAPPDATA (from env): ${localAppDataDir}`)
  if (!fs.existsSync(localAppDataDir)) {
    throw new Error('Env var LOCALAPPDATA exists, but the path does not exist')
  }
  const voltaAppDir = path.join(localAppDataDir, 'Volta')
  if (!fs.existsSync(voltaAppDir)) {
    throw new Error(`Volta app data directory does not exist at ${voltaAppDir}`)
  }
  return voltaAppDir
}

export async function removePnpmFromJsonFiles(dirPath: string) {
  log(`- removing pnpm from JSON files in ${dirPath}`)
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory does not exist at ${dirPath}`)
  }
  const dir = await fsp.readdir(dirPath)
  for (const file of dir) {
    const filePath = path.join(dirPath, file)
    const fileStats = await fsp.stat(filePath)
    if (!fileStats.isFile() || path.extname(file) !== '.json') {
      continue
    }
    const fileData = await fsp.readFile(filePath, 'utf-8')
    const fileJson = JSON.parse(fileData)
    if (!fileJson.platform) {
      continue
    }
    if (fileJson.platform.pnpm) {
      delete fileJson.platform.pnpm
    }
    await fsp.writeFile(filePath, JSON.stringify(fileJson, null, 2), 'utf-8')
  }
}
