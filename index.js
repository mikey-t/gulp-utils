const fs = require('fs')
const fsp = require('fs').promises
const which = require('which')
const { spawn, spawnSync } = require('child_process')
const path = require('path')
const tar = require('tar')

const defaultSpawnOptions = {
  shell: true,
  stdio: ['ignore', 'inherit', 'inherit']
}
const spawnOptionsWithInput = { ...defaultSpawnOptions, stdio: 'inherit' }

function waitForProcess(childProcess) {
  return new Promise((resolve, reject) => {
    childProcess.once('exit', (returnCode) => {
      if (returnCode === 0) {
        resolve(returnCode)
      } else {
        reject(returnCode)
      }
    })
    childProcess.once('error', (err) => {
      reject(err)
    })
  })
}

async function copyNewEnvValues(fromPath, toPath) {
  await copyEnv(fromPath, toPath, false)
}

async function overwriteEnvFile(fromPath, toPath) {
  await copyEnv(fromPath, toPath)
}


async function throwIfDockerNotRunning() {
  if (!which.sync('docker')) {
    throw Error('docker command not found')
  }

  let childProcess = spawnSync('docker', ['info'], { encoding: 'utf8' })
  if (childProcess.error) {
    throw childProcess.error
  }
  if (!childProcess.stdout || childProcess.stdout.includes('ERROR: error during connect')) {
    throw Error('docker is not running')
  }
}

async function bashIntoRunningDockerContainer(containerNamePartial, entryPoint = 'bash') {
  await throwIfDockerNotRunning()

  let childProcess = spawnSync('docker', ['container', 'ls'], { encoding: 'utf8' })
  if (childProcess.error) {
    throw childProcess.error
  }

  let matchingLines = childProcess.stdout.split('\n').filter(line => line.includes(containerNamePartial))

  if (!matchingLines || matchingLines.length === 0) {
    throw Error('container is not running')
  }

  if (matchingLines.length > 1) {
    throw Error('more than one container matches the provided containerNamePartial ' + containerNamePartial)
  }

  let stringArray = matchingLines[0].split(/(\s+)/)

  let containerName = stringArray[stringArray.length - 1]

  console.log('full container name: ' + containerName)

  const args = ['exec', '-it', containerName, entryPoint]
  return waitForProcess(spawn('docker', args, spawnOptionsWithInput))
}

async function dockerContainerIsRunning(containerNamePartial) {
  await throwIfDockerNotRunning()

  let childProcess = spawnSync('docker', ['container', 'ls'], { encoding: 'utf8' })
  if (childProcess.error) {
    throw childProcess.error
  }

  let matchingLines = childProcess.stdout.split('\n').filter(l => l.includes(containerNamePartial))

  return !!matchingLines && matchingLines.length > 0
}

async function copyEnv(fromPath, toPath, overrideAll = true) {
  await ensureFile(fromPath, toPath)

  let templateDict = getEnvDictionary(fromPath)
  let envDict = getEnvDictionary(toPath)

  // Determine what keys are missing from .env that are in template
  let templateKeys = Object.keys(templateDict)
  let envKeys = Object.keys(envDict)
  let missingKeys = templateKeys.filter(k => !envKeys.includes(k))

  if (missingKeys.length > 0) {
    console.log(`Adding missing keys in ${toPath}: `, missingKeys)
  }

  // Merge missing values with existing
  let newEnvDict = {}
  for (const [key, value] of Object.entries(overrideAll ? templateDict : envDict)) {
    newEnvDict[key] = value
  }
  for (const key of missingKeys) {
    newEnvDict[key] = templateDict[key]
  }

  // Sort
  let newDictEntries = Object.entries(newEnvDict)
  let newSortedEntries = newDictEntries.sort((a, b) => {
    if (a < b) {
      return -1
    }
    if (a > b) {
      return 1
    }
    return 0
  })

  // Write to .env file
  let newEnvFileContent = ''
  for (let kvp of newSortedEntries) {
    newEnvFileContent += `${kvp[0]}=${kvp[1]}\n`
  }
  await fsp.writeFile(toPath, newEnvFileContent)
}

function getEnvDictionary(filePath) {
  let dict = {}
  fs.readFileSync(filePath).toString().split('\n').forEach(function (line) {
    if (line && line.indexOf('=') !== -1) {
      line = line.replace('\r', '').trim()
      let parts = line.split('=')
      dict[parts[0].trim()] = parts[1].trim()
    }
  })
  return dict
}

async function ensureFile(fromPath, toPath) {
  if (!fs.existsSync(toPath)) {
    console.log('Creating new file ' + toPath)
    await fsp.copyFile(fromPath, toPath)
  }
}

exports.defaultSpawnOptions = {
  shell: true,
  cwd: __dirname,
  stdio: ['ignore', 'inherit', 'inherit']
}

async function createTarball(directoryToTarball, outputDirectory, tarballName, cwd = '') {
  if (!directoryToTarball || directoryToTarball.length === 0) {
    throw new Error('directoryToTarball is required')
  }
  if (!outputDirectory || outputDirectory.length === 0) {
    throw new Error('outputDirectory is required')
  }
  if (!tarballName || tarballName.length === 0) {
    throw new Error('tarballName is required')
  }

  const tarballPath = path.join(outputDirectory, tarballName)

  console.log('directory to create tarball from: ' + directoryToTarball)
  console.log('output will be: ' + tarballPath)

  let normalizedDirectoryToTarball = !!cwd ? path.join(cwd, directoryToTarball) : directoryToTarball

  if (!fs.existsSync(normalizedDirectoryToTarball)) {
    throw new Error('error: dirToTarball directory does not exist: ' + normalizedDirectoryToTarball)
  }

  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory)
  } else {
    if (fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath)
    }
  }

  let options = { gzip: true, file: tarballPath }
  if (!!cwd) {
    options.cwd = cwd
  }

  await tar.c(options, [directoryToTarball])
}

async function dockerCompose(command, projectName, dockerRelativeDirectory, detached = false) {
  if (!projectName || projectName.length === 0) {
    throw new Error('projectName is required')
  }

  const dockerRelativeDir = dockerRelativeDirectory || 'docker'
  const dockerWorkingDir = path.join(process.cwd(), dockerRelativeDir)

  if (!fs.existsSync(dockerWorkingDir)) {
    throw new Error('Docker directory does not exist: ' + dockerWorkingDir)
  }

  await throwIfDockerNotRunning()

  const dockerSpawnOptions = { ...defaultSpawnOptions, cwd: dockerWorkingDir }

  let args = ['--project-name', projectName, command]
  if (detached) {
    args.push('-d')
  }

  return waitForProcess(spawn('docker-compose', args, dockerSpawnOptions))
}

async function dockerDepsUp(projectName, dockerRelativeDirectory) {
  return dockerCompose('up', projectName, dockerRelativeDirectory)
}

async function dockerDepsUpDetached(projectName, dockerRelativeDirectory) {
  return dockerCompose('up', projectName, dockerRelativeDirectory, true)
}

async function dockerDepsDown(projectName, dockerRelativeDirectory) {
  return dockerCompose('down', projectName, dockerRelativeDirectory)
}

async function dockerDepsStop(projectName, dockerRelativeDirectory) {
  return dockerCompose('stop', projectName, dockerRelativeDirectory)
}

async function dotnetBuild(release = true) {
  let args = ['build']
  if (release) {
    args.push('-c', 'Release')
  }

  return waitForProcess(spawn('dotnet', args, defaultSpawnOptions))
}

async function dotnetPack(projectDirectoryPath, release = true) {
  if (!projectDirectoryPath) {
    throw Error('projectDirectoryPath param is required')
  }

  let args = ['pack']
  if (release === true) {
    args.push('-c', 'Release')
  }

  const spawnOptions = { ...defaultSpawnOptions, cwd: projectDirectoryPath }
  logCommand('dotnet', args, spawnOptions)
  await waitForProcess(spawn('dotnet', args, spawnOptions))
}

async function dotnetNugetPublish(projectDirectoryPath, csprojFilename, release = true, nugetSource = 'https://api.nuget.org/v3/index.json') {
  const apiKey = process.env.NUGET_API_KEY
  if (!apiKey) {
    throw Error('env var NUGET_API_KEY is required')
  }

  const packageDir = path.join(projectDirectoryPath, release ? 'bin/Release' : 'bin/Debug')

  const packageName = await getPackageName(projectDirectoryPath, csprojFilename)
  console.log('publishing package ' + packageName)
  const spawnOptions = { ...defaultSpawnOptions, cwd: packageDir }
  await waitForProcess(spawn('dotnet', [
    'nuget',
    'push',
    packageName,
    '--api-key',
    apiKey,
    '--source',
    nugetSource], spawnOptions))
}

async function getPackageName(projectPath, csprojFilename) {
  const namespace = csprojFilename.substring(0, csprojFilename.indexOf('.csproj'))
  const csprojPath = path.join(projectPath, csprojFilename)
  const csproj = fs.readFileSync(csprojPath, 'utf-8')
  const versionTag = '<PackageVersion>'
  const xmlVersionTagIndex = csproj.indexOf(versionTag)
  const versionStartIndex = xmlVersionTagIndex + versionTag.length
  const versionStopIndex = csproj.indexOf('<', versionStartIndex)
  const version = csproj.substring(versionStartIndex, versionStopIndex)
  return `${namespace}.${version}.nupkg`
}

async function logCommand(command, args, spawnOptions) {
  console.log('running command: ' + `${command} ${args.join(' ')}`)
  console.log('with spawn options: ' + JSON.stringify(spawnOptions))
}

exports.defaultSpawnOptions = defaultSpawnOptions
exports.waitForProcess = waitForProcess
exports.copyNewEnvValues = copyNewEnvValues
exports.overwriteEnvFile = overwriteEnvFile
exports.throwIfDockerNotRunning = throwIfDockerNotRunning
exports.bashIntoRunningDockerContainer = bashIntoRunningDockerContainer
exports.dockerContainerIsRunning = dockerContainerIsRunning
exports.createTarball = createTarball
exports.dockerDepsUp = dockerDepsUp
exports.dockerDepsUpDetached = dockerDepsUpDetached
exports.dockerDepsDown = dockerDepsDown
exports.dockerDepsStop = dockerDepsStop
exports.dotnetBuild = dotnetBuild
exports.dotnetPack = dotnetPack
exports.dotnetNugetPublish = dotnetNugetPublish
