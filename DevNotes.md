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

Rather than using one of the mega hacks to override the import system for mocking, I'm going to use standard dependency injection patterns. And then to still be able to export just individual utility methods, I'm going to be re-exporting just the individual class methods so the classes and dependency injection are invisible to consumers. For an example see [./src/TarballUtility.ts](./src/TarballUtility.ts) and [./test/TarballUtility.test.ts](./test/TarballUtility.test.ts) and where it's re-exported in [./src/index.ts](./src/index.ts).

### Package Consumer Notes

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
