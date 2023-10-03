import { isPlatformWindows, log, simpleSpawnSync, spawnAsync } from './generalUtils.js'

// Untested - moved over from old project
export class NixUtil {
  private sudoerUsername: string = ''
  private populateSudoerErrorMessage: string = ''

  constructor() {
    if (isPlatformWindows()) {
      throw new Error('NixUtil is not supported on Windows')
    }

    this.tryPopulateSudoerUsername()
  }

  private async tryPopulateSudoerUsername() {
    const sudoerId = process.env.SUDO_UID

    if (sudoerId === undefined) {
      this.populateSudoerErrorMessage = 'cannot get sudoer username - process not started with sudo'
      return
    }

    log(`attempting to find username for sudoer id ${sudoerId}`)

    const childProcess = simpleSpawnSync('id', ['-nu', sudoerId])

    if (childProcess.code !== 0) {
      throw new Error(`Unable to get sudoer username - id command exited with code ${childProcess.code}. Stderr: ${childProcess.stderr}`)
    }

    let username = childProcess.stdout

    if (!username) {
      this.populateSudoerErrorMessage = 'unable to get sudoer username - id command did not return a username'
      return
    }

    username = username.replace('\n', '')

    log(`using sudoer username: ${username}`)

    this.sudoerUsername = username
  }

  private async runAsSudoer(cmd: string, cwd?: string) {
    if (!this.sudoerUsername) {
      if (this.populateSudoerErrorMessage) {
        throw new Error(this.populateSudoerErrorMessage)
      } else {
        throw new Error('sudoer username was not populated - cannot continue')
      }
    }

    const cmdArgs = `-H -u ${this.sudoerUsername} bash -c`.split(' ')
    cmdArgs.push(`'${cmd}'`)
    await spawnAsync('sudo', cmdArgs, { cwd: cwd ?? process.cwd() })
  }
}
