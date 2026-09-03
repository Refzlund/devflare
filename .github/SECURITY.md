# Security Policy

## Supported versions

Devflare is currently published under the `next` prerelease tag on the road to a
stable `1.0.0`. Security fixes are applied to the latest published version; there
is no back-porting to older prereleases. Once `1.0.0` ships, the latest released
minor on the `latest` tag is the supported line.

| Version            | Supported |
| ------------------ | --------- |
| latest `next.*`    | ✅        |
| `1.0.0` (upcoming) | ✅        |
| older prereleases  | ❌        |

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for a
suspected vulnerability.

- Preferred: open a [GitHub private security advisory](https://github.com/Refzlund/devflare/security/advisories/new).
- Or email **arthur@refzlund.com** with details and, if possible, a minimal
  reproduction.

You can expect an initial acknowledgement within a few business days. Once a fix
is prepared, a patched version is published under the `next` (or, after 1.0, the
`latest`) tag and the advisory is disclosed.

## Scope note

Devflare is a local development and testing toolkit for Cloudflare Workers; it is
not intended to run as a production server. Its local emulation surfaces (the dev
runtime, the bridge, and the browser-rendering shim) bind to loopback by default.
Reports about loopback-only dev surfaces are still welcome but are triaged with
that intended-local-use context in mind.
