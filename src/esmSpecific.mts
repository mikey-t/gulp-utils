import { fileURLToPath } from 'node:url'

export const getImportMetaUrlFilePath = () => {
  // @ts-ignore
  return fileURLToPath(import.meta.url)
}
