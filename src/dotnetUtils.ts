import { log, requireString, requireValidPath, spawnAsync, trace, which } from './generalUtils.js'

// For JSDoc link
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { SpawnError } from './generalUtils.js'

export { getLatestNugetPackageVersion } from './NugetUtility.js'
export { isTargetFrameworkMonikerGreaterThanOrEqualToNet5 } from './dotnetUtilsInternal.js'

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
  const traceMessage = `running dotnet ${args.join(' ')}`
  const traceAdditional = cwd ? ` in cwd ${cwd}` : ''
  trace(`${traceMessage}${traceAdditional}`)
  await spawnAsync('dotnet', args, { cwd: cwd })
}

/**
 * Install or update a global dotnet tool.
 * @param toolName The name of the dotnet global tool
 */
export async function installOrUpdateDotnetGlobalTool(toolName: string) {
  if (!(await which('dotnet')).location) {
    throw new Error('"dotnet" is not installed')
  }
  const installed = (await which(toolName)).location
  if (installed) {
    log(`${toolName} tool already installed, updating...`)
  } else {
    log(`${toolName} tool not installed, installing...`)
  }
  const args = ['tool', installed ? 'update' : 'install', '--global', toolName]
  await spawnAsync('dotnet', args)
}

/**
 * Spawns a process that runs the necessary commands to install or update the dotnet-ef tool globally on the system.
 */
export async function installOrUpdateDotnetEfTool() {
  await installOrUpdateDotnetGlobalTool('dotnet-ef')
}

export async function installOrUpdateReportGeneratorTool() {
  await installOrUpdateDotnetGlobalTool('dotnet-reportgenerator-globaltool')
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
