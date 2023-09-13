import { series } from 'swig-cli'
import * as nodeCliUtils from '@mikeyt23/node-cli-utils'
const certUtils = require('@mikeyt23/node-cli-utils/certUtils')
import * as fs from 'node:fs'
import path from 'node:path'

nodeCliUtils.config.traceEnabled = true

const dockerPath = './docker'
const dockerComposePath = `${dockerPath}/docker-compose.yml`
const directoriesWithEnv = [dockerPath]

export const hello = async function () {
  return 'Hello World'
}
export const dockerUp = series(['dockerUp', async () => doDockerCompose('up')])
export const dockerUpAttached = series(syncEnvFiles, ['dockerDown', async () => doDockerCompose('down')], ['dockerUpAttached', async () => doDockerCompose('up', true)])
export const dockerDown = series(syncEnvFiles, ['dockerUp', async () => doDockerCompose('down')])
export async function syncEnvFiles() {
  const rootEnvPath = './.env'
  await nodeCliUtils.copyNewEnvValues(`${rootEnvPath}.template`, rootEnvPath)
  for (const dir of directoriesWithEnv) {
    await nodeCliUtils.overwriteEnvFile(rootEnvPath, path.join(dir, '.env'))
  }
}

async function doDockerCompose(upOrDown: 'up' | 'down', attached = false) {
  await nodeCliUtils.spawnDockerCompose(dockerComposePath, upOrDown, { attached })
}

export async function linuxInstallCert() {
  certUtils.linuxInstallCert() // This doesn't actually install anything - it just dumps out instructions for how to do it manually...
}
