# DevNotes for node-cli-utils

Writing down the things I learned for future projects.

## Local Npm Package Testing

Steps to link:

- Check what is already linked: `npm ls --link=true`
- Within publishing package:
    - Build: `swig build`
    - Run: `npm link`
- Within consuming project:
    - Ensure you have already added the dependency normally (`npm i -D @mikeyt23/node-cli-utils`) and that the version semver notation allows the newest version (perhaps change version to "*" if testing a new major version)
    - Run: `npm link @mikeyt23/node-cli-utils`
- Do testing

Steps to unlink:

- Within consuming package: `npm unlink @mikeyt23/node-cli-utils`
- Within publishing package: `npm unlink`
- Verify it's no longer linked: `npm ls --link=true`

## Testing Notes

### Test Framework and Test Execution

I'm using the [built-in NodeJS test runner](https://nodejs.org/docs/latest-v18.x/api/test.html). I'm utilizing loaders to parse and run my typescript directly using [tsx](https://github.com/esbuild-kit/tsx). Tsx here doesn't stand for typescript JSX, but rather TypeScript eXecute. It's really, really fast. However, note that because it uses esbuild, if you switch between windows and WSL to run tests (which I do so I can verify my stuff works on windows and ubuntu), then you may need to run `npm install` when switching. This is because of the esbuild dependency.

Test commands:

```
swig test
swig testWatch
swig testOnly
swig testWatchOnly
```

Some other notes:

- The built-in NodeJS test runner is a bit lacking in some areas, but so far it seems to work really well
- The syntax for "only" testing is a little wonky (have to pass `{ only: true }` as a second param to `test` or `it`), so to easy that a bit I added this to testUtils.ts: `export const only = { only: true }`
- Note that using the "only" functionality requires adding the "only" option to both the test and it's parent (like a `describe` call) if it has one
- Using "only" on one test within a describe will cause any `beforeEach` and `afterEach` hooks to run for every other method in the `describe` block, even thought they're skipped. This can cause confusion if you're looking for some test output. The easiest way I found to workaround this is just to move your "only" test outside the describe block temporarily
- Adding new test files currently requires adding them explicitly to `swigfile.ts` in the `testFiles` array. I created the utility method `findFilesRecursively` in [./src/generalUtils.ts](./src/generalUtils.ts) that I might wire up to this in the future to automatically detect all the "*.test.ts" files, but for now I kind of like that a) it's explicit and b) I'm not using a method under test to find the tests.

### Mocking Strategy (Dependency Injection)

Rather than using one of the "conventional" mega hacks to override the import system for mocking, I'm going to try using standard dependency injection patterns. But rather than exporting these new classes, I'll still export only the utility methods and not each entire class by re-exporting individual methods of a singleton class. This way the extra classes and dependency injection are invisible to consumers. For an example see [./src/TarballUtility.ts](./src/TarballUtility.ts) and [./test/TarballUtility.test.ts](./test/TarballUtility.test.ts) and where it's re-exported in [./src/index.ts](./src/index.ts).

### Test Coverage Report

I'm using [c8](https://github.com/bcoe/c8) for generating code coverage reports. Some notes on this:

- Config file is `.c8rc.json` and accepts the same args as the CLI (see docs linked above)
- Added, removed or renamed test files need to be updated in both `swigfile.ts` and `.c8rc.json`
- Generate a report with `swig testCoverage`
- Html report is generated in the `./coverage` directory (entry point: `./coverage/index.html`)
- I'm using `ts-node/esm` as the loader when running tests with code coverage because `tsx` was not generating accurate line numbers for uncovered lines (there's something wrong with it's source map functionality?). I'm using the tsconfig.json ts-node option "transpileOnly" in order to speed it up a little.
- I'm still using `tsx` as the loader for running tests normally because it's slightly faster (even a little faster than ts-node with transpileOnly)
- **Important:** Somewhat hilariously, c8 counts comments as lines of covered code, so adding comments increases percentage of coverage. Oof.
    - See https://github.com/bcoe/c8/issues/182
    - For now I'm ignoring the percentage and really just using the tool to tell me "number of uncovered lines", for which it's accurate
    - I may look into using some other tool if accuracy in the percentage numbers becomes more important to me

## Package Consumer Notes

When using the `node-cli-utils` functionality in my test project ([dotnet-react-sandbox](https://github.com/mikey-t/dotnet-react-sandbox)), I found that the code is more readable if I use namespace imports so that it's super clear when these utility methods are being called and aren't confused with other internal helper methods.

So the imports would look like this:

```javascript
import * as nodeCliUtils from '@mikeyt23/node-cli-utils'
import * as certUtils from '@mikeyt23/node-cli-utils/certUtils'
import * as dbMigrationUtils from '@mikeyt23/node-cli-utils/dbMigrationUtils'
import * as dotnetUtils from '@mikeyt23/node-cli-utils/dotnetUtils'
```

And calls would like like this:

```javascript
await nodeCliUtils.ensureDirectory(releaseDir)
await certUtils.generateCertWithOpenSsl(url)
// etc
```

But you can also import individual methods.

### Enable Trace

Given this import:

```javascript
import * as nodeCliUtils from '@mikeyt23/node-cli-utils'
```

set trace enabled with:

```javascript
nodeCliUtils.config.traceEnabled = true
```

Or with this import:

```
import { config } from '@mikeyt23/node-cli-utils'
```

set trace enabled with:

```javascript
config.traceEnabled = true
```

## SonarQube Quality/Security Scanning

Initial setup:

- If on windows 10 and WSL 2
    - Ensure `%USERPROFILE%/.wslconfig` has these lines:
    ```
    [wsl2]
    kernelCommandLine = "sysctl.vm.max_map_count=262144"
    ```
    - Restart WSL (shutdown with `wsl.exe shutdown`, wait 10 seconds, then open an ubuntu shell to trigger startup)
    - Start docker again if it isn't set to start automatically
- Copy `.env.template` to `.env`
- Start SonarQube for the first time: `swig dockerUp`
- Hit `http://localhost:9000` and wait for it to initialize
- Login with `admin`/`admin` and change password when it prompts
- Navigate to My Account -> Security and generate a new user token
- Add new token to `SONAR_TOKEN` in `.env`

Scan:

- In admin terminal, run: `swig testCoverageAll`
- Run: `swig dockerUp`
- Run: `swig scan`
- Evaluate results at http://localhost:9000
- When done with SonarQube, bring it down by running: `swig dockerDown`

Misc notes on SonarQube setup:

- Docker compose notes:
    - Syntax for using a default if not specified: `${SONAR_PORT:-9000}`
    - Syntax for requiring a env var and throwing if not set: `${SONAR_TOKEN:?}`
    - Unclear exactly what this does, but docs suggested setting the cache volume: `sonar_scanner_cache:/opt/sonar-scanner/.sonar/cache`
    - Setting the cache volume required setting the user to `root` so it could read/write to/from the cache. This probably isn't optimal - will re-visit later.
    - I wanted to define both services in a single docker compose so that the scanner can reference the server URL by docker service name, but I don't actually want both of them to run at the same time when running "docker compose up". Setting a profile on the scanner makes it so it doesn't start unless that profile flag is passed, or if the run command is called directly.
- Scanner run time was incredibly slow (5 minutes) until I set the `sonar.working.directory` to a directory within the docker container and then it runs in a reasonable amount of time (26 seconds). The relevant docker-compose.yml entry: `command: sh -c "mkdir -p /tmp/sonar-scanner && sonar-scanner -Dsonar.working.directory=/tmp/sonar-scanner"`

