# Security Policy

## Supported versions

Security fixes are released for the latest major version.

| Version | Supported |
| ------- | --------- |
| 3.x     | Yes       |
| < 3.0   | No        |

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's [private vulnerability reporting](https://github.com/wankdanker/plus-express/security/advisories/new) rather than in a public issue.

Include the affected version, a description of the issue, and steps or code to reproduce it. Fixes are announced in GitHub security advisories and the [changelog](CHANGELOG.md).

## Verifying releases

Releases are published to npm from GitHub Actions with [npm provenance](https://docs.npmjs.com/generating-provenance-statements), so each version can be traced to the commit and workflow that built it. To verify the packages you have installed:

```sh
npm audit signatures
```
