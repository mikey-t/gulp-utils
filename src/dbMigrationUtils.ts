import { Emoji, getConfirmation, log, requireString, requireValidPath, spawnAsync } from './generalUtils.js'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'

/**
 * Wrapper function for `dotnet ef`. If you don't pass `false` for `noBuild`, be sure the project has already been built by some other means.
 * 
 * Docs for "dotnet ef" CLI: https://learn.microsoft.com/en-us/ef/core/cli/dotnet.
 * @param projectPath Path to project that has the DbContext and Migration files used for the `--project` argument
 * @param dbContextName The name of the DbContext class used for the `--context` argument
 * @param args Arguments to pass to the `dotnet ef` CLI
 * @param noBuild If true, the `--no-build` argument will be passed to the `dotnet ef` CLI (default: true)
 */
export async function dotnetEfCommand(projectPath: string, dbContextName: string, args: string[], noBuild = true): Promise<number> {
  requireValidPath('projectPath', projectPath)
  requireString('dbContextName', dbContextName)
  const result = await spawnAsync('dotnet', ['ef', '--project', projectPath, ...args, '--context', dbContextName, ...(noBuild ? ['--no-build'] : [])])
  return result.code
}

/**
 * Wrapper function for `dotnet ef migrations list`.
 * @param projectPath The path to the project that contains the DbContext and Migration files
 * @param dbContextName The name of the DbContext class
 */
export async function efMigrationsList(projectPath: string, dbContextName: string) {
  await dotnetEfCommand(projectPath, dbContextName, ['migrations', 'list'],)
}

/**
 * Wrapper function for `dotnet ef database update <migration_name>`.
 * @param projectPath The path to the project that contains the DbContext and Migration files
 * @param dbContextName The name of the DbContext class
 * @param migrationName The name of the migration to update to (optional). If not provided, all migrations will be applied.
 */
export async function efMigrationsUpdate(projectPath: string, dbContextName: string, migrationName?: string) {
  await dotnetEfCommand(projectPath, dbContextName, ['database', 'update', ...(migrationName ? [migrationName] : [])])
}

/**
 * 
 * @param projectPath The path to the project that contains the DbContext and Migration files
 * @param dbContextName The name of the DbContext class
 * @param migrationName The name of the migration to add
 * @param withBoilerplate If true, boilerplate will be added to the migration C# file and empty Up and Down SQL files will be created
 */
export async function efAddMigration(projectPath: string, dbContextName: string, migrationName: string, withBoilerplate = false) {
  const projectDirectory = projectPath.endsWith('.csproj') ? projectPath.substring(0, projectPath.lastIndexOf('/')) : projectPath
  const migrationsOutputDir = getMigrationsProjectRelativePath(dbContextName)
  await dotnetEfCommand(projectPath, dbContextName, ['migrations', 'add', migrationName, '-o', migrationsOutputDir])
  if (withBoilerplate) {
    try {
      await addDbMigrationBoilerplate(projectDirectory, dbContextName, migrationName)
    } catch (error) {
      console.error(error)
      await efRemoveLastMigration(projectPath, dbContextName, true)
    }
  }
}

/**
 * 
 * @param projectPath The path to the project that contains the DbContext and Migration files
 * @param dbContextName The name of the DbContext class
 * @param skipConfirm If `true`, the user will not be prompted to confirm the removal of the last migration
 */
export async function efRemoveLastMigration(projectPath: string, dbContextName: string, skipConfirm = false) {
  const lastMigrationName = await getLastMigrationName(projectPath, dbContextName)

  if (!skipConfirm && !await getConfirmation(`Are you sure you want to remove the last migration: ➡️${lastMigrationName}?`)) {
    return
  }

  const returnCode = await dotnetEfCommand(projectPath, dbContextName, ['migrations', 'remove'])
  if (returnCode !== 0) {
    throw new Error(`dotnet ef migrations remove returned non-zero exit code: ${returnCode}`)
  }

  log(`Removing migration SQL script files for migration if they're empty`)
  await deleteScriptFileIfEmpty(getScriptPath(projectPath, lastMigrationName, true))
  await deleteScriptFileIfEmpty(getScriptPath(projectPath, lastMigrationName, false))
}

async function deleteScriptFileIfEmpty(scriptPath: string) {
  if (fs.existsSync(scriptPath)) {
    const scriptContents = fs.readFileSync(scriptPath, { encoding: 'utf8' })
    if (scriptContents.trim().length === 0) {
      await fsp.unlink(scriptPath)
    } else {
      log(`${Emoji.Warning} Skipping deletion of non-empty script file: ${scriptPath}`)
    }
  }
}

async function getLastMigrationName(projectPath: string, dbContextName: string) {
  const migrationsDirectory = getMigrationsDirectory(projectPath, dbContextName)
  const filenames = fs.readdirSync(migrationsDirectory)
  const migrationNames = filenames.filter(filename =>
    filename.endsWith('.cs') &&
    !filename.endsWith('.Designer.cs') &&
    !filename.endsWith('.ModelSnapshot.cs') &&
    filename.includes('_')).map(filename => filename.substring(0, filename.length - 3))
  const migrationNamesWithTimestamps = migrationNames.map(migrationName => {
    const timestamp = migrationName.substring(0, 14)
    const name = migrationName.substring(15)
    return { timestamp, name }
  })
  log(`Found migrations: ${migrationNamesWithTimestamps.map(m => m.name).join(', ')}`)
  log(`Found timestamps: ${migrationNamesWithTimestamps.map(m => m.timestamp).join(', ')}`)
  const sortedMigrationNames = [...migrationNamesWithTimestamps].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const lastMigrationName = sortedMigrationNames[sortedMigrationNames.length - 1].name
  return lastMigrationName
}

function getMigrationsProjectRelativePath(dbContextName: string) {
  return `Migrations/${dbContextName}Migrations`
}

function getMigrationsDirectory(projectDirectory: string, dbContextName: string) {
  return path.join(projectDirectory, `Migrations/${dbContextName}Migrations`)
}

function getScriptPath(projectDirectory: string, migrationName: string, isUp: boolean) {
  return path.join(projectDirectory, `Scripts/${migrationName}${isUp ? '' : '_Down'}.sql`)
}

async function getCSharpMigrationFilePath(projectDirectory: string, dbContextName: string, migrationName: string) {
  const migrationsOutputDir = getMigrationsDirectory(projectDirectory, dbContextName)

  if (!fs.existsSync(migrationsOutputDir)) {
    throw new Error(`Unable to add migration C# boilerplate - could not find migrations output directory: ${migrationsOutputDir}`)
  }

  log(`Checking for generated C# file 📄XXXX_${migrationName}.cs in directory 📁${migrationsOutputDir}`)

  const filenamePattern = `_${migrationName}.cs`
  const filenames = fs.readdirSync(migrationsOutputDir).filter(filename => filename.endsWith(filenamePattern))
  if (!filenames || filenames.length === 0) {
    throw new Error(`Auto-generated migration file not found - migrations output directory has no C# files ending with : ${filenamePattern}`)
  }

  if (filenames.length > 1) {
    throw new Error(`Auto-generated migration file not found - migrations output directory has multiple C# files with the same migration name: ${filenames.join(', ')}`)
  }

  const filename = filenames[0]
  const filePath = path.join(migrationsOutputDir, filename)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Issue generating file path for migration (bad file path): ${filePath}`)
  }

  return filePath
}

async function addDbMigrationBoilerplate(projectDirectory: string, dbContextName: string, migrationName: string) {
  const filePath = await getCSharpMigrationFilePath(projectDirectory, dbContextName, migrationName)

  log(`Replacing file contents with boilerplate for file 📄${filePath}`)

  const newFileContents = cSharpMigrationFileTemplate
    .replaceAll(contextNamePlaceholder, dbContextName)
    .replaceAll(migrationNamePlaceholder, migrationName)

  await fsp.writeFile(filePath, newFileContents, { encoding: 'utf8' })

  log(`Updated file with boilerplate - please ensure it is correct: 📄${filePath}`)

  const upScriptPath = path.join(projectDirectory, `Scripts/${migrationName}.sql`)
  const downScriptPath = path.join(projectDirectory, `Scripts/${migrationName}_Down.sql`)

  log('\nCreating corresponding empty sql files (no action will be taken if they already exist):')
  log(`  - 📄${upScriptPath}`)
  log(`  - 📄${downScriptPath}\n`)

  await writeEmptySqlFileIfNotExists(upScriptPath, 'Up')
  await writeEmptySqlFileIfNotExists(downScriptPath, 'Down')
}

async function writeEmptySqlFileIfNotExists(scriptPath: string, scriptType: 'Up' | 'Down') {
  if (!fs.existsSync(scriptPath)) {
    await fsp.writeFile(scriptPath, '', { encoding: 'utf8' })
  } else {
    log(`Skipping ${scriptType} sql script (already exists)`)
  }
}

const contextNamePlaceholder = '{{context_name}}'
const migrationNamePlaceholder = '{{migration_name}}'
const cSharpMigrationFileTemplate = `using Microsoft.EntityFrameworkCore.Migrations;
using MikeyT.DbMigrations;

#nullable disable

namespace DbMigrator.Migrations.${contextNamePlaceholder}Migrations
{
    public partial class ${migrationNamePlaceholder} : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            MigrationScriptRunner.RunScript(migrationBuilder, "${migrationNamePlaceholder}.sql");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            MigrationScriptRunner.RunScript(migrationBuilder, "${migrationNamePlaceholder}_Down.sql");
        }
    }
}

`
