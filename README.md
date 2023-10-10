# node-cli-utils

This library is a collection of miscellaneous utility functions for Node CLI scripting.

I primarily use this library with [swig-cli](https://github.com/mikey-t/swig) to automate project dev tasks and generally to glue all the things together. Check out an example project that uses both swig-cli and node-cli-utils: [dotnet-react-sandbox](https://github.com/mikey-t/dotnet-react-sandbox).

## Documentation

Auto-generated TypeDoc documentation: [https://mikey-t.github.io/node-cli-utils-docs/](https://mikey-t.github.io/node-cli-utils-docs/).

Generated with [TypeDoc](https://github.com/TypeStrong/typedoc).

## Install

```
npm i -D @mikeyt23/node-cli-utils
```

## Exported Modules

Utility functions are grouped into the following sub-modules:

| Module | Description |
|--------|-------------|
| @mikeyt23/node-cli-utils | General utils |
| @mikeyt23/node-cli-utils/dockerUtils | Docker utils |
| @mikeyt23/node-cli-utils/dbMigrationUtils  | DB migration utils (see [db-migrations-dotnet](https://github.com/mikey-t/db-migrations-dotnet)) |
| @mikeyt23/node-cli-utils/dotnetUtils | Dotnet utils |
| @mikeyt23/node-cli-utils/certUtils | Cert utils |
| @mikeyt23/node-cli-utils/colors | Utils methods to add color to CLI output |
| @mikeyt23/node-cli-utils/DependencyChecker | Util class for checking system dependencies |
| @mikeyt23/node-cli-utils/hostFileUtils | Host file utils |
| @mikeyt23/node-cli-utils/testUtils | Helper methods for use with the NodeJS test runner | 

## Reasoning

NodeJS projects are out-of-control with the depth of their dependency trees. Rather than giving in to that trend, I'm attempting to maintain a collection of utilities using only built-in NodeJS functionality whenever possible, and only importing things when I simply can't easily reproduce the functionality myself. And when I do import a dependency, it will preferably be one with a shallow dependency tree.

In some ways this is bad because I'm obviously re-inventing the wheel and there's other libraries that do some of this stuff way better. But here's what I'm getting by doing it this way:

- Significantly less work to keep things up to date - I don't have to audit dozens or hundreds or thousands of dependency and transitive dependency updates on a regular basis
- Significantly less (or zero) risk of NPM supply chain attacks
- Getting more hands-on XP with the fundamentals of NodeJS Typescript development
- Control. Do I know who to talk to for bug fixes or feature improvements? Of course I know him - he's me!

Originally I made an exception to this rule for [node-tar](https://github.com/isaacs/node-tar). However, I replaced this with a system call to the OS built-in `tar` utility since even Windows has this built-in since 2018.

Also - just my personal opinion - every serious developer should create and maintain libraries like this. It's not always about reinventing the wheel or not. Sometimes it's about learning about different types of wheels by creating some yourself.

Why one big package instead of smaller targeted packages? Smaller more focused packages would indeed be better, but only if I actually had time to maintain them all, which I don't. That decision will inevitably make this package a poor choice for most people for many reasons, but the benefit drastically outweighs the cost, in my opinion.

## Semver

I won't be adhering to strict semver. I chose to group a large number of unrelated things into a single project so that I don't have to spend all my time maintaining many small projects. As a result, I probably won't be able to realistically bump minor/major versions every time there is a method signature change in a single function, for example.

However, I plan on keeping the project well-documented and I also plan on continuing to increase unit test coverage, so hopefully the downsides of my approach will be somewhat mitigated.

## Noteworthy Features

### Process Spawning Cross-Platform Workarounds

Dev automation tasks in all my projects make heavy use of spawning child processes, but unfortunately there's a lot of issues that cause this to be inconsistent across platforms. I've attempted to normalize some of the more annoying edge cases. 

For example, sometimes the only way to get a command to work how you want on windows is to pass the `shell: true` option. One case where this is useful is for running commands for a long running process that you want to be able to terminate with `ctrl+c` when you're done with it. These are commands like `docker compose up`, or running a dev web server, or anything that runs until you stop it. But on windows when you use `ctrl+c` to terminate a process spawned without the `shell: true` option, it immediately kills all the processes in the tree without warning or signaling, which is bad if those processes need to shut down gracefully before exiting. For example, on windows if you use `ctrl+c` on `docker compose up` spawned by Node, you'll notice that the containers are still running even after the attached command exits. But if you do the same thing on a nix machine, docker is given the `SIGINT` signal and it gracefully stops the containers before shutting down.

But this issue is of the whack-a-mole variety, because if you do go ahead and pass the `shell: true` option, then unexpected termination of the parent process will simply orphan your child process tree, forcing you to kill it yourself manually, or with some other scripting.

So normally you can do one of a couple things so that your process spawning code works well on windows in addition to nix machines:

- Use another library where someone claims to have solved this completely in a cross-platform way (`press x to doubt`), and accept a non-trivial number of dependencies into your project
- Use the non-shell option and just deal with some commands terminating non-gracefully
- Use the shell option and just deal with long running processes sometimes getting orphaned

Instead I've chosen to create a couple of different wrapper methods for Node's spawn method. One calls spawn fairly normally (`spawnAsync` in [./src/generalUtils.ts](./src/generalUtils.ts)), with an additional option to get the exec-like functionality of throwing on non-zero return code if you want. And another wrapper that is used for long running processes that uses the shell option, but if you're on windows does a nifty little hack to spawn a "middle" watchdog process that polls for whether the parent is alive or not and kills the child process tree if it becomes orphaned (`spawnAsyncLongRunning` in [./src/generalUtils.ts](./src/generalUtils.ts)).

In the future I may go research how others have solved cross-platform process spawning, but for now this little hack works fine.
