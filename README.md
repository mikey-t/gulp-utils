# node-cli-utils

This library is a collection of miscellaneous utility functions for Node CLI scripting.

I primarily use this library with [swig-cli](https://github.com/mikey-t/swig) to automate project dev tasks and generally to glue all the things together. Check out an example project that uses both swig-cli and node-cli-utils: [dotnet-react-sandbox](https://github.com/mikey-t/dotnet-react-sandbox).

## Documentation

Auto-generated [TypeDoc](https://github.com/TypeStrong/typedoc) documentation:

[https://mikey-t.github.io/node-cli-utils-docs/](https://mikey-t.github.io/node-cli-utils-docs/)

## Install as Dev Dependency

```
npm i -D @mikeyt23/node-cli-utils
```

## Exported Modules

Utility functions are grouped into the following sub-modules:

| Module | Description |
|--------|-------------|
| @mikeyt23/node-cli-utils | General utils |
| @mikeyt23/node-cli-utils/dockerUtils | Docker utils |
| @mikeyt23/node-cli-utils/dotnetUtils | Dotnet utils |
| @mikeyt23/node-cli-utils/certUtils | Cert utils |
| @mikeyt23/node-cli-utils/colors | Util methods to add color to CLI output |
| @mikeyt23/node-cli-utils/DependencyChecker | Util class for checking system dependencies |
| @mikeyt23/node-cli-utils/hostFileUtils | Host file utils |
| @mikeyt23/node-cli-utils/parallel | A runParallel method and a ParallelExecutor class |
| @mikeyt23/node-cli-utils/testUtils | Helper methods for use with the NodeJS test runner | 
