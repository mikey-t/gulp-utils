import { fileURLToPath } from 'node:url'

/**
 * Only dynamically import this if ESM is detected. This allows a CJS-specific build to avoid
 * an error it would otherwise encounter when parsing import.meta.url.
 * @returns the file path of the currently executing script
 */
export const getImportMetaUrlFilePath = () => {
  // @ts-ignore
  return fileURLToPath(import.meta.url)
}
