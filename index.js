const fs = require('fs')
const fsp = require('fs').promises
const which = require('which')
const {spawn, spawnSync} = require('child_process')

const defaultSpawnOptions = {
  shell: true,
  stdio: ['ignore', 'inherit', 'inherit']
}
const spawnOptionsWithInput = {...defaultSpawnOptions, stdio: 'inherit'}

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

  let childProcess = spawnSync('docker', ['info'], {encoding: 'utf8'})
  if (childProcess.error) {
    throw childProcess.error
  }
  if (!childProcess.stdout || childProcess.stdout.includes('ERROR: error during connect')) {
    throw Error('docker is not running')
  }
}

async function bashIntoRunningDockerContainer(containerNamePartial, entryPoint = 'bash') {
  await throwIfDockerNotRunning()

  let childProcess = spawnSync('docker', ['container', 'ls'], {encoding: 'utf8'})
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

  let childProcess = spawnSync('docker', ['container', 'ls'], {encoding: 'utf8'})
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

exports.defaultSpawnOptions = defaultSpawnOptions
exports.waitForProcess = waitForProcess
exports.copyNewEnvValues = copyNewEnvValues
exports.overwriteEnvFile = overwriteEnvFile
exports.throwIfDockerNotRunning = throwIfDockerNotRunning
exports.bashIntoRunningDockerContainer = bashIntoRunningDockerContainer
exports.dockerContainerIsRunning = dockerContainerIsRunning
