# npm-age-pin

Give new npm releases **three days (72 hours)** before installing them. Resolve a package to an eligible release, pin its exact version, and install with lifecycle scripts disabled.

This is a small, dependency-free standalone adaptation of the release-age installer in [CrossCheck](https://github.com/sburl/CrossCheck/blob/main/scripts/install-safe-shims.sh). Background: [CrossCheck PR #143](https://github.com/sburl/CrossCheck/pull/143).

A waiting period can reduce exposure to freshly published malicious releases by leaving time for discovery and removal. **Age is not a malware verdict.**

## Use

Requires Node.js 22+ and npm on macOS or Linux. No npm package has been published; run the checked-out source:

```sh
git clone https://github.com/sburl/npm-age-pin.git
cd npm-age-pin
node bin/npm-age-pin.mjs lodash --dry-run
```

To use it from any project, add the checkout's `bin` directory to your PATH (substitute its absolute location):

```sh
export PATH="/absolute/path/to/npm-age-pin/bin:$PATH"
cd /path/to/your/project
npm-age-pin lodash
npm-age-pin @babel/core --save-dev
```

You can also invoke the script by its absolute path. Nothing is installed merely by cloning the repo, and no shell startup files or global npm settings are changed.

```sh
npm-age-pin lodash --dry-run           # print the pin; install nothing
npm-age-pin lodash@latest --dry-run    # check the tag's current target
npm-age-pin lodash@4.17.21             # exact versions must pass the age check too
npm-age-pin typescript -D             # save an exact devDependency
npm-age-pin typescript -g             # global install
npm-age-pin lodash --age-days 7       # choose a longer delay
```

If an existing npm PATH shim interferes, point to your real npm executable:

```sh
REAL_NPM=/absolute/path/to/npm npm-age-pin lodash
```

## Selection policy

- The default cutoff is the current time minus 72 hours. A release exactly at the cutoff qualifies.
- A bare package name selects the **most recently published** eligible stable release, which is not necessarily the highest semantic version. This can select an older major or a maintenance release; inspect `--dry-run` before adopting a pin.
- A tag such as `latest` resolves to its **current** version. That version must pass the cutoff; a too-new tag fails rather than guessing its previous target. The tool does not reconstruct tag history or modify registry tags.
- An explicit version is checked too. Prereleases are available only through an explicit version or tag.
- Deprecated versions, missing timestamps and absent versions are ineligible. Metadata/network errors fail closed. Every requested package must resolve before npm is started.
- Installs pass `--save-exact` and `--ignore-scripts`. Unknown options, semver ranges, Git URLs, tarballs and local paths are rejected.

Metadata comes from the public npm registry. This tool does not support private registries or scoped registry overrides. Use it only where npm configuration directs the requested packages to the public registry. It trusts registry metadata, your clock, your npm executable and your local configuration.

## Scope and limits

This checks **the direct packages named on the command line**, not their transitive dependency graph, existing project dependencies or existing lockfiles. npm can still resolve newer transitive dependencies. Review and retain the lockfile; use a package manager's native release-age policy when you need broader resolution coverage.

It is an explicit command, not a machine-wide guard or sandbox. Plain `npm`, `npx`, other package managers and direct binary calls bypass it. It does not scan code for malware or integrate the original CrossCheck Socket wrapper. Older packages can still be malicious or vulnerable.

`--ignore-scripts` suppresses install lifecycle scripts; some packages need those scripts to build. It does not stop code from running when you later import a package or run its CLI. See [npm's configuration documentation](https://docs.npmjs.com/cli/v11/using-npm/config/#ignore-scripts).

Waiting also delays legitimate fixes. A human may choose a reviewed urgent update outside this command; this tool deliberately has no zero-day bypass flag. Three days is a chosen tradeoff, not a proven safe interval.

## Development

```sh
node --test
```

Tests run without network access or installing dependencies and cover the 72-hour boundary, scoped packages, tags, explicit versions, malformed input, registry failures and npm argument construction.

MIT licensed. The standalone implementation retains the CrossCheck project's attribution; it does not change an existing local CrossCheck installation.
