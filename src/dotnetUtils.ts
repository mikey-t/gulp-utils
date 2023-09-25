import { log, requireString, requireValidPath, spawnAsync, trace, whichSync } from './generalUtils.js'

// For JSDoc link
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { SpawnError } from './generalUtils.js'

/**
 * Runs dotnet build on the specified project.
 * @param projectPath Path to project file (like .csproj) or directory of project to build
 * @throws A {@link SpawnError} if the spawned process exits with a non-zero exit code
 */
export async function dotnetBuild(projectPath: string) {
  requireValidPath('projectPath', projectPath)
  await spawnAsync('dotnet', ['build', projectPath], { throwOnNonZero: true })
}

/**
 * Helper method to spawn a process and run 'dotnet publish'.
 * @param projectPath Path to project file (like .csproj) or directory of project to build
 * @param configuration Build configuration, such as 'Release'
 * @param outputDir The relative or absolute path for the build output
 * @param cwd Optionally run the command from another current working directory
 */
export async function dotnetPublish(projectPath: string = './', configuration: string = 'Release', outputDir: string = 'publish', cwd?: string) {
  requireValidPath('projectPath', projectPath)
  requireString('outputDir', outputDir)
  requireString('configuration', configuration)
  if (cwd) {
    requireValidPath('cwd', cwd)
  }
  const args = ['publish', projectPath, '-c', configuration, '-o', outputDir]
  trace(`running dotnet ${args.join(' ')}${cwd ? ` in cwd ${cwd}` : ''}`)
  await spawnAsync('dotnet', args, { cwd: cwd })
}

/**
 * Spawns a process that runs the necessary commands to install or update the dotnet-ef tool globally on the system.
 */
export async function installOrUpdateDotnetEfTool() {
  const installed = whichSync('dotnet-ef').location
  if (installed) {
    log('dotnet-ef tool already installed, updating...')
  } else {
    log('dotnet-ef tool not installed, installing...')
  }
  const args = ['tool', installed ? 'update' : 'install', '--global', 'dotnet-ef']
  await spawnAsync('dotnet', args)
}

/**
 * Spawns a process that runs the following commands to clean and re-install the dotnet dev certs:
 * - dotnet dev-certs https --clean
 * - dotnet dev-certs https -t
 */
export async function configureDotnetDevCerts() {
  await spawnAsync('dotnet', ['dev-certs', 'https', '--clean'])
  await spawnAsync('dotnet', ['dev-certs', 'https', '-t'])
}
