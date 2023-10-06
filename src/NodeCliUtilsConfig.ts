/**
 * Config to control a few misc settings in the node-cli-utils package. This module exports a singleton instance.
 */
export class NodeCliUtilsConfig {
  private _traceEnabled: boolean = false
  private _orphanProtectionPollingIntervalMillis = 15000
  private _orphanProtectionLoggingEnabled = false
  private _orphanProtectionLoggingPath = './orphanProtection.log'
  private _useWslPrefixForDockerCommands: boolean = false

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

  get useWslPrefixForDockerCommands(): boolean {
    return this._useWslPrefixForDockerCommands
  }

  /**
   * If `true`, docker commands that normally just run `docker` will use `wsl docker` instead. This requires any paths
   * passed to be wsl paths, but these should be handled internally with no additional action required by the caller.
   */
  set useWslPrefixForDockerCommands(value: boolean) {
    this._useWslPrefixForDockerCommands = value
  }
}

/**
 * Singleton instance of {@link NodeCliUtilsConfig}.
 */
export const config = new NodeCliUtilsConfig()
