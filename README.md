# node-cli-utils

This library is a collection of miscellaneous utility functions for Node CLI scripting.

I primarily use this library with [swig-cli](https://github.com/mikey-t/swig) to automate project dev tasks and generally to glue all the things together. Check out an example project that uses both swig-cli and node-cli-utils: [dotnet-react-sandbox](https://github.com/mikey-t/dotnet-react-sandbox).

Documentation for this project is auto-generated from JSDoc using [TypeDoc](https://github.com/TypeStrong/typedoc).

## Install

```
npm install @mikeyt23/node-cli-utils --save-dev
```

## Exported Modules

Utility functions are loosely grouped into 4 modules:

- General utils (index)
- DB migration utils (related to this project: [db-migrations-dotnet](https://github.com/mikey-t/db-migrations-dotnet))
- Dotnet utils
- Cert utils

## Reasoning

NodeJS projects are out-of-control with the depth of their dependency trees. Rather than giving in to that trend, I'm attempting to maintain a small set of simple helper methods using built-in NodeJS functionality whenever possible, and only importing things when I simply can't easily reproduce the functionality myself. And when I do import a dependency, it will preferably be one with a shallow dependency tree.

In some ways this is bad because I'm obviously re-inventing the wheel and there's other libraries that do some of this stuff way better. But here's what I'm getting by doing it this way:

- Significantly less work to keep things up to date - I don't have to audit dozens or hundreds or thousands of dependency and transitive dependency updates on a regular basis
- Significantly less risk of NPM supply chain attacks
- Getting more hands-on XP with the fundamentals of NodeJS Typescript development
- Control. Do I know who to talk to for bug fixes or feature improvements? Of course I know him - he's me!

So far the only exception I've made for dependencies in this particular project is [node-tar](https://github.com/isaacs/node-tar). The author is well-established and publishes very clean well-tested packages with shallow dependency trees. Even in this case I think I'd like to attempt to make my own version that's just a wrapper method for built-in OS functionality with branching logic to use tar on nix and powershell on windows.

Also - just my personal opinion - but every serious developer should create and maintain libraries like this. It's not always about reinventing the wheel or not. Sometimes it's about learning about different types of wheels by creating some yourself.

## Noteworthy Features

### Process Spawning Cross-Platform Workarounds

Dev automation tasks in all my projects make heavy use of spawning child processes, but unfortunately there's a lot of issues that cause this to be inconsistent across platforms. I've attempted to normalize some of the more annoying edge cases. 

For example, sometimes the only way to get a command to work how you want on windows is to pass the `shell: true` option. One case where this is useful is for running commands for a long running process that you want to be able to terminate with `ctrl+c` when you're done with it. These are commands like `docker compose up`, or running a dev web server, or anything that runs until you stop it. But on windows when you use `ctrl+c` to terminate a process spawned without the `shell: true` option, it immediately kills all the processes in the tree, which is bad if those processes need to shut down gracefully before exiting. For example, on windows if you use `ctrl+c` on `docker compose up` spawned by Node, you'll notice that the containers are still running even after the attached command exits. But if you do the same thing on a nix machine, docker is given the `SIGINT` signal and it gracefully stops the containers before shutting down.

But this issue is of the whack-a-mole variety, because if you do go ahead and pass the `shell: true` option, then unexpected termination of the parent process will simply orphan your child process tree, forcing you to kill it yourself manually, or with some other scripting.

So normally you can do one of a couple things so that your process spawning code works well on windows in addition to nix machines:

- Use another library where someone claims to have solved this completely in a cross-platform way (`press x to doubt`), and accept a super long list of dependencies of dependencies into your project
- Use the non-shell option and just deal with some commands terminating non-gracefully
- Use the shell option and just deal with long running processes sometimes getting orphaned

Instead I've chosen to create a couple of different wrapper methods for Node's spawn method. One calls spawn fairly normally (`spawnAsync` in [./src/generalUtils.ts](./src/generalUtils.ts)), with an additional option to get the exec-like functionality of throwing on non-zero return code if you want. And another wrapper that is used for long running processes that uses the shell option, but if you're on windows does a nifty little hack to spawn a "middle" watchdog process that polls for whether the parent is alive or not and kills the child process tree if it becomes orphaned (`spawnAsyncLongRunning` in [./src/generalUtils.ts](./src/generalUtils.ts)).

I may decide there's a better way in the future or perhaps I could be convinced that some of the other libraries out there have this figured out, but that day is not today. Despite seeming like a wonky workaround, it seems to work really well so far, and only does this on windows and only if you call the `spawnAsyncLongRunning` version.

## TODO

- New `createTarball` helper that uses built-in OS functionality (would be cool to be able to delete the only dependency out of the project)
- Unit tests, obviously...
