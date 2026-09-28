# npm-age-pin

**Give new npm releases three days before running their code.**

Supply-chain attacks turn ordinary dependency installs into a way onto your machine. A compromised maintainer account can ship malicious code under a package name you already trust, and install scripts can run before you even use the library. GitHub's account of the [Shai-Hulud npm attack](https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/) shows that pattern in practice.

The observed activity has grown sharply: [Sonatype recorded 3,430 malicious-package advisories in 2025](https://www.sonatype.com/resources/research/attacking-the-assembly-line), compared with an annual average of 931 in 2021–2023. That's one research team's detection data, but it illustrates the scale of the problem.

My default is simple: **wait before installing a new release.** Most routine dependency updates can wait three days. That leaves time for researchers, registries, and other users to notice a compromise before its code reaches my computer.

`npm-age-pin` turns that waiting period into a check: select a release at least **72 hours old**, pin its exact version, and install with lifecycle scripts disabled. Tags and explicit versions must pass the age check too. If the age can't be established, the command refuses.

The cutoff applies to each release, even if the package has existed for years. Three days is a practical default, not a guarantee of safety; an urgent security fix may call for a reviewed exception.

## Keep agents inside the policy

Coding agents can choose and install dependencies with little human attention. While fixing a build, an agent might grab the latest version, switch installers, or run `npx` and accidentally skip your waiting period.

The principle behind this tool is **deterministic checks around LLMs**. An agent can propose a dependency. Code should compare its publication date with the cutoff before allowing the install. A prompt telling the agent to be careful is useful guidance, but the installation path needs to enforce the rule.

For commands routed through this tool, the age check runs every time. Enforcing it across an agent's environment also means restricting alternate install paths and keeping policy changes and exceptions under human control. **This standalone command does not provide that containment:** an agent able to call plain npm, change the cutoff, or edit the wrapper can bypass the intended policy.

## Waiting and Socket

I use [Socket](https://socket.dev/) too. Its [npm integration](https://docs.socket.dev/docs/socket-npm-socket-npx) checks packages before installation and can block them based on security alerts. Waiting gives a bad release time to be discovered; scanning adds another check on what gets installed.

This project grew out of the local installation shims in [CrossCheck](https://github.com/sburl/CrossCheck/blob/main/scripts/install-safe-shims.sh) and [PR #143](https://github.com/sburl/CrossCheck/pull/143). The broader CrossCheck shim combines release-age selection with Socket scanning when Socket is installed. **npm-age-pin is the dependency-free standalone age check; it does not bundle or invoke Socket itself.**

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
