# @mikeyt23/node-cli-utils

Simple node cli utils to:

- Wait for a node spawned process
- Copy env template file to env file
- Sync new env values from template to "real" env files
- Manage all env values in root files that then get copied to other locations
- Dotnet helper methods:
  - Pack and publish a NuGet package
  - Wrapper commands to install or update dotnet ef tool
  - Wrapper commands to spawn dotnet run and publish
  - Helper methods for DB migration commands (see [mikey-t/db-migrations-dotnet](https://github.com/mikey-t/db-migrations-dotnet))

# Env Utility Function Notes

A project can have multiple locations that require the same env values. For example, you might have a database that needs to be used by a docker project, your main app and also a db migration project. Rather than having to remember where each of the .env files is, we want to use the root directory and overwrite subdirectory env files with the ones in the root. We also want to add new `.env.template` values to the root `.env` files and propagate them to subdirectories - all without having to know about anything about any of the .env files except the ones in the root of the project.

# Examples

An example syncEnvFiles gulp task function:

```JavaScript
const projectDir = 'src/YourProjectDir/'
const serverAppDir = `src/${projectDir}`
const clientAppDir = `src/${projectDir}client-app/`
const dockerDir = 'docker/'

async function syncEnvFiles() {
  const rootServerEnv = './.env.server'
  const rootClientEnv = './.env.client'
  
  // Copy new values from root .env.[category].template to .env.[category]
  await copyNewEnvValues('./.env.server.template', rootServerEnv)
  await copyNewEnvValues('./.env.client.template', rootClientEnv)

  // Copy root .env.[category] to subdirectory .env files (overwrites target env file)
  // Server env to server app and docker directories
  await overwriteEnvFile(rootServerEnv, path.join(serverAppDir, '.env'))
  await overwriteEnvFile(rootServerEnv, path.join(dockerDir, '.env'))
  // Client env to client app directory
  await overwriteEnvFile(rootClientEnv, path.join(clientAppDir, '.env'))
}

exports.syncEnvFiles = syncEnvFiles
```

> **WARNING**: Be sure to .gitignore `.env`, `.env.server` and `.env.client` files in the root **AND** the location they're being copied to. Only the template files with placeholder values should go in source control. For example, your .gitignore could have `**/.env*` and then `!.env.server.template` and `!.env.client.template`, etc.

Example gulp task calling docker-compose:

```JavaScript
const spawnOptions = {...defaultSpawnOptions}

const dockerDirPath = 'docker/'
const dockerDepsProjectName = 'your_project'
const dockerDepsComposeName = 'docker-compose.deps.yml'

const dockerSpawnOptions = {...spawnOptions, cwd: path.resolve(__dirname, dockerDirPath)}

async function dockerDepsUpDetached() {
  return waitForProcess(spawn('docker-compose', ['--project-name', dockerDepsProjectName, '-f', dockerDepsComposeName, 'up', '-d'], dockerSpawnOptions))
}

exports.dockerDepsUpDetached = series(syncEnvFiles, dockerDepsUpDetached)
```

Example gulp task using util method `throwIfDockerNotRunning`:


```JavaScript
async function dockerDepsUp() {
  await throwIfDockerNotRunning()
  return waitForProcess(spawn('docker-compose', ['--project-name', dockerDepsProjectName, '-f', dockerDepsComposeName, 'up'], dockerSpawnOptions))
}

exports.dockerDepsUp = series(syncEnvFiles, dockerDepsUp)
```

Example gulp task using util method `dockerContainerIsRunning`:

```JavaScript
async function throwIfDockerDepsNotUp() {
  const postgresIsRunning = await dockerContainerIsRunning(`${dockerDepsProjectName}_postgresql`)
  if (!postgresIsRunning) {
    throw 'Docker dependencies are not running'
  }
}

async function runDbMigrator() {
  return waitForProcess(spawn('dotnet', [`publish/${DotnetNamespace}.DbMigrator.dll`], migratorSpawnOptions))
}

exports.dbMigrate = series(throwIfDockerDepsNotUp, parallel(syncEnvFiles, deleteMigratorPublishDir), publishMigrator, runDbMigrator)
```

Example gulp task using util method `bashIntoRunningDockerContainer` and `argv` to pass in param `--imageName`:

```JavaScript
async function dockerBashRunningContainer() {
  await throwIfDockerNotRunning()
  await bashIntoRunningDockerContainer(`${dockerDepsProjectName}_${argv['imageName']}`)
}

exports.dockerBash = dockerBashRunningContainer
```

