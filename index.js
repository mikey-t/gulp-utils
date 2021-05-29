const fs = require('fs')
const fsp = require('fs').promises

exports.waitForProcess = function(childProcess) {
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

exports.copyNewEnvValues = async function(fromPath, toPath) {
  await copyEnv(fromPath, toPath, false)
}

exports.overwriteEnvFile = async function(fromPath, toPath) {
  await copyEnv(fromPath, toPath)
}

exports.defaultSpawnOptions = {
  shell: true,
  cwd: __dirname,
  stdio: ['ignore', 'inherit', 'inherit']
}

copyEnv = async function(fromPath, toPath, overrideAll = true) {
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
