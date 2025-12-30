# Development workflow

Read this before setting up or starting a Web project's development environment. Apply the
parts for the chosen language and current project state; an existing working project does not
need to repeat completed setup. Platform configuration fields and current listener values are
owned by [runtime](runtime.md); workspace identity and Cloud filesystem behavior by
[project](project.md). Local authorization and worktree preparation must follow [Local](../worklocally/SKILL.md)
before project operations. Mobile uses its fixed [Mobile workflow](mobile.md).

For the [default template](default-template.md), reuse the installed source and dependencies.
Use the applicable diagnostics flow below; host-managed starter diagnostics are registered during initialization.

## Project setup and dependencies

Choose the Web language, framework, libraries, layout, styling, and test tools that fit the
request. Scaffold inside the authoritative project directory. For a project with dependencies,
create its manifest before the first source batch and install those dependencies before
starting language diagnostics or writing that batch. A native static site does not acquire a
package-manager requirement merely by using Webdev.

Keep installation and checks non-interactive. Resolve dependency/setup failures before
rewriting otherwise-valid source in response to missing-module or missing-type diagnostics.
Run only the migrations the chosen application needs. Commit dependency manifests, lockfiles,
and installation policy; do not commit installed dependency directories such as `node_modules`,
`.venv`, or `vendor`. Use the project's own tools rather than assuming Node commands for another
stack. Cloud's regenerable build I/O follows [workspace/cache handling](project.md).

### Node package-manager installations

When the chosen project uses Node, pin the package manager in `packageManager`. Before the
first installation, put lifecycle-script permissions in checked-in project configuration.
For pnpm 11+, use `pnpm-workspace.yaml` and reviewed `allowBuilds` decisions (`true` for required
scripts, `false` for intentionally blocked scripts). The removed `onlyBuiltDependencies` and
`ignoredBuiltDependencies` settings do not substitute for that policy on pnpm 11. For a project
pinned to pnpm 10, keep its reviewed lists in `pnpm-workspace.yaml`, not `package.json`; do not
assume an older pin supports `allowBuilds`. Preserve a compatible existing policy.

Never use `--ignore-scripts` or an interactive approval command such as bare
`pnpm approve-builds`. Do not leave a foreground command waiting for stdin. With pnpm 10.1+,
check `pnpm ignored-builds` after installing. If a required script is blocked, correct its
version-appropriate policy and rebuild it. `Cannot identify` is inconclusive: check that the
installed tree exists, the required permissions are explicit, and the actual consuming tool
works. A transitive package need not be directly resolvable from the project root; test its
consumer instead of adding an unused direct dependency to make a probe work.

Continue only after installation succeeds and required script outputs work. Do not change
working dependency declarations or repeatedly install just to obtain the word `None`. Never
manufacture package-manager output with `echo`, `printf`, or hand-written text.


## Language-server setup

Inspect `webdev.config` GET `runtime/post-edit` before choosing a diagnostics setup. A response
with `languages` means the host owns the language server: default Web and mobile TypeScript
projects are registered during initialization. If another language is needed, PUT the language
list described in [Diagnostics](diagnostics.md); do not launch a second server.

A response with `servers` uses the agent-managed setup in [Diagnostics](diagnostics.md),
including Device and Operator runtimes.
A working application server alone does not prove that language checking is registered.

Fix actionable diagnostics against the current source. Absence of a reminder does not prove
that checking completed. If the chosen server cannot check the project reliably, use the
language's existing check-only command for the relevant code.

## Development checks

Choose existing typechecks, lint, tests, targeted builds or health checks for the behavior changed.
Do not install a checker or test framework merely to fill a category, or run another checker
solely to repeat the same edit-time diagnostic. Documentation-only changes do not require
business tests. If existing tests are not discovered, fix discovery before claiming they passed.

Run a selected full suite at most once by default. After a fix, rerun failed or directly affected
tests, naming their files or cases. Repeat the suite only when a broad change invalidates the
earlier result. Report only checks that actually ran and their observed results.

The [main skill](../SKILL.md#4-validate-before-delivery) owns the independent-review trigger and
browser policy. Publication build requirements belong to
[build contracts](../deployment/references/build-contracts.md).

## Development service

Use `service=true` when starting the resident development service.

Use the effective Cloud listener port and host from the runtime contract. Local uses the exact
Session loopback port and network permission in [Local](../worklocally/SKILL.md); Mobile has its own two-port
readiness contract. Do not silently accept a framework choosing another port.

A resident job being `running` is its steady state, not a stuck finite command. Never wait for
it to finish or include it in a wait-for-background-work completion list. Check readiness by an
HTTP request from the shell, not a screenshot or an assumption about the Preview window.

The Addon does not programmatically start the development server. Each Cloud Session has its
own sandbox: after attaching for active development, restore missing dependencies and start
the existing project's development command in this Session, then verify HTTP readiness.
Do not assume that the previous Session's process carries over. Use the receipt's confirmed
Cloud port and configuration; repair a reported configuration mismatch before relying on it.

Local runs on the user's computer. Inspect its current state and act as appropriate for the
request: reuse a suitable healthy service or start one when needed. A supplied Session port
is a declaration, not proof of an applied listener; do not query merely to rediscover it.
Avoid blindly starting, restarting or stopping user processes. After an interruption within
the same Session, inspect what is missing before starting another copy. In either mode,
respect a user stop request or read-only scope.

## Terminal scope

Set `cwd` to the exact absolute `project_dir` on project `exec` calls, including calls with
`service: true`. A separate service terminal does not inherit another terminal's directory;
inline `cd <project_dir> &&` alone does not select the project environment before startup.
Reuse the named terminal for subsequent ordinary commands. These steps never authorize
switching the Session to another project or worktree.
