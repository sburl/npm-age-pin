# npm-age-pin

**Reduce supply-chain risk by waiting to install new releases.**

Supply-chain attacks are a growing problem for anyone installing dependencies. An attacker compromises a maintainer account or publishes a malicious package, and an ordinary install brings their code onto your machine. In the [Shai-Hulud npm attack](https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/), compromised packages used malicious post-install scripts to spread the attack.

[Sonatype recorded 3,430 malicious-package advisories in 2025](https://www.sonatype.com/resources/research/attacking-the-assembly-line), compared with an annual average of 931 in 2021–2023. That's one research team's detection data, but it gives a sense of the change in scale.

I rarely need a dependency update right when it comes out. Waiting gives researchers, registries, and other users time to spot a compromise before I install it. It's an easy precaution to make the default.

**npm-age-pin is a standalone project based on the package-installation policy in [CrossCheck](https://github.com/sburl/CrossCheck).**[^crosscheck] For packages installed through it, the rule is simple: select a release at least **72 hours old**, pin its exact version, and install with installation scripts disabled. Tags and explicit versions must pass the age check too. If the age can't be established, the command refuses.

## Give new code a little time

Installing a package is a decision to trust someone else's code. Arbitrary code can run during installation, before you've even used the library. A familiar package name doesn't protect you if its latest release came from a compromised account.

Three days is a practical default, not a point at which code becomes safe. Malware can go undiscovered longer, and an urgent security fix may justify a reviewed exception. The cutoff applies to the individual release, even if the package has existed for years.

I also use [Socket](https://socket.dev/), whose [npm integration](https://docs.socket.dev/docs/socket-npm-socket-npx) checks packages before installation and can block them based on security alerts. npm-age-pin provides the standalone age check; it doesn't bundle or invoke Socket.

## Make agents follow the waiting period

Coding agents can choose and install dependencies without much human attention. An agent trying to fix a build might grab the latest version, use `npx`, or switch installation commands.

Putting “wait three days” in an instructions file is a start, but agents forget and do unpredictable things. **If you need an agent to follow a rule, enforce it with a deterministic check.** Here, code compares the release date with the cutoff before allowing the install.

For agents, you also need to enforce which installation paths are available. Plain `npm install` bypasses this command. An agent that can change the cutoff or edit the wrapper can change the policy. Route installs through the checks and restrict alternate paths outside the agent's control, with exceptions handled deliberately by a human.

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

MIT licensed. Based on the CrossCheck release-age idea; this project does not change an existing local CrossCheck installation.

[^crosscheck]: Source: [CrossCheck PR #143 — enforce safe-install policy via PreToolUse and Git hooks](https://github.com/sburl/CrossCheck/pull/143). The [CrossCheck installer](https://github.com/sburl/CrossCheck/blob/main/scripts/install-safe-shims.sh) combines release-age selection with Socket scanning when Socket is installed. npm-age-pin applies the release-age idea in a standalone tool with a three-day default.
