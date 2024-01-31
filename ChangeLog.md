# Change Log

## 2.0.27

- Updated `spawnDockerCompose` so it doesn't throw an error if code 130 is generated from process termination via "ctrl + c" 

## 2.0.28

- Updated `spawnAsync` so `throwOnNonZero` defaults to `true`

## 2.0.29

- Added `splitByWhitespace`method to general utils

## 2.0.30

- Added `whichWsl` method to general utils

## 2.0.31

- Added `dockerComposeBash` method to docker utils

## 2.0.33

- Updated `spawnAsyncLongRunning` to better handle complex args by serializing to json/base64 and deserializing in `ruWhileParentAlive.ts`. It will also now add double quotes around any args with spaces, which will enable easy spawning of long running commands within WSL, for example:

```typescript
await spawnAsyncLongRunning(
  'wsl',
  [
    '-e',
    'sh',
    '-c',
    'SOME_ENV=whatever SOME_OTHER_ENV=42 ./someExecutable'
  ]
)
```
