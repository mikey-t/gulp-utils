import fsp from 'node:fs/promises'
import os from 'node:os'
import { getHostname, isPlatformWindows, log, requireString, stringToNonEmptyLines } from './generalUtils.js'

export async function ensureHostsEntry(url: string): Promise<void> {
  const hostname = getHostname(url)
  await changeHostsFile(hostname, 'add')
}

export async function removeHostsEntry(url: string): Promise<void> {
  const hostname = getHostname(url)
  await changeHostsFile(hostname, 'remove')
}

export function getHostsPath(): string {
  return isPlatformWindows() ? 'C:/Windows/System32/drivers/etc/hosts' : '/etc/hosts'
}

export async function getHostsFileString(): Promise<string> {
  return await fsp.readFile(getHostsPath(), { encoding: 'utf-8' })
}

// Check by normalizing whitespace (collapse consecutive spaces to single spaces) in entry and on each line checked
export function hostsFileStringHasEntry(hostsFileString: string, entry: string): boolean {
  const normalizedEntry = entry.replace(/\s+/g, ' ')
  const hostsLines = stringToNonEmptyLines(hostsFileString).map(l => l.replace(/\s+/g, ' ')).filter(l => !l.startsWith('#'))
  const hasLine = hostsLines.includes(normalizedEntry)
  return hasLine
}

export async function changeHostsFile(hostname: string, operation: 'add' | 'remove'): Promise<void> {
  requireString('hostname', hostname)
  const isAddition = operation === 'add'
  const isRemoval = operation === 'remove'
  const hostsPath = getHostsPath()
  const entry = getNewHostsEntryString(hostname)

  log(`checking hosts file: ${hostsPath} for entry ${entry}`)
  const hostsFileString = await getHostsFileString()
  const hasLine = hostsFileStringHasEntry(hostsFileString, entry)

  if (isAddition && hasLine) {
    log(`there is an existing entry in the hosts file (${entry}), skipping`)
    return
  }
  if (isRemoval && !hasLine) {
    log(`there is no hosts entry to remove (${entry}), skipping`)
  }
  if (isAddition && !hasLine) {
    log('existing entry not found - appending entry to the hosts file')
    await fsp.appendFile(hostsPath, `\n${entry}`)
  }
  if (isRemoval && hasLine) {
    log(`existing entry found - removing entry`)
    const hostsWithoutEntry = getEolNormalizedWithoutLine(hostsFileString, entry)
    await fsp.writeFile(hostsPath, hostsWithoutEntry)
  }
}

/**
 * The `initialString` will have line endings normalized to use os.EOL and lines with `omitLine` will be removed.
 * Comparisons for which lines should be removed are normalizing whitespace (multiple spaces collapsed into single
 * spaces for the comparison). This is useful to remove instances of a hosts entry, for example.
 * @param initialString The string to normalize remove instances of omitLine from
 * @param omitLine All instance of this string will be omitted from the result
 * @returns A string that has instances of the omitLine removed and all line endings changed to match the os.EOL
 */
export function getEolNormalizedWithoutLine(initialString: string, omitLine: string): string {
  const normalizedOmitLine = omitLine.replace(/\s+/g, ' ')
  const lines = initialString.split('\n')
    .map(l => l.replace(/\r/g, ''))
    .filter(l => l.replace(/\s+/g, ' ') !== normalizedOmitLine)
  return lines.join(os.EOL)
}

function getNewHostsEntryString(hostname: string): string {
  return `127.0.0.1 ${hostname}`
}
