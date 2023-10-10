import { isPlatformWindows } from './generalUtils.js'

/**
 * Config to control a few misc settings in the node-cli-utils package. This module exports a singleton instance.
 */
export class NodeCliUtilsConfig {
  private _traceEnabled: boolean = false
  private _orphanProtectionPollingIntervalMillis = 15000
  private _orphanProtectionLoggingEnabled = false
  private _orphanProtectionLoggingPath = './orphanProtection.log'
  private _useWslPrefixForDockerCommandsOnWindows: boolean = true

  get traceEnabled(): boolean {
    return this._traceEnabled
  }

  set traceEnabled(value: boolean) {
    this._traceEnabled = value
  }

  get orphanProtectionPollingIntervalMillis(): number {
    return this._orphanProtectionPollingIntervalMillis
  }

  set orphanProtectionPollingIntervalMillis(value: number) {
    this._orphanProtectionPollingIntervalMillis = value
  }

  get orphanProtectionLoggingEnabled(): boolean {
    return this._orphanProtectionLoggingEnabled
  }

  set orphanProtectionLoggingEnabled(value: boolean) {
    this._orphanProtectionLoggingEnabled = value
  }

  get orphanProtectionLoggingPath(): string {
    return this._orphanProtectionLoggingPath
  }

  get useWslPrefixForDockerCommandsOnWindows(): boolean {
    return isPlatformWindows() && this._useWslPrefixForDockerCommandsOnWindows
  }
  
  set useWslPrefixForDockerCommandsOnWindows(value: boolean) {
    this._useWslPrefixForDockerCommandsOnWindows = value
  }
}

/**
 * Singleton instance of {@link NodeCliUtilsConfig}.
 */
export const config = new NodeCliUtilsConfig()
