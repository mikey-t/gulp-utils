import { linuxInstallCert } from '@mikeyt23/node-cli-utils/certUtils'

export const hello = async function () {
  console.log('hello world')
}

export async function doLinuxInstallCert() {
  // await spawnAsync('echo', ['hello', 'world'])
  linuxInstallCert()
}
