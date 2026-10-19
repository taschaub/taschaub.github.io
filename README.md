# 2FA Code Finder for Raycast — Gmail integration

Public application homepage and privacy policy for the Gmail OAuth integration maintained by Aaron Schaub (`taschaub`).

- Website: https://taschaub.github.io/
- Upstream: https://github.com/raycast/extensions/tree/main/extensions/imessage-2fa
- Contributor fork: https://github.com/taschaub/raycast-extensions
- Repaired extension source: [`extension/`](extension/)

The static site uses no build step, cookies, analytics script or client-side email processing. The Gmail extension is a separate locally executed Raycast extension; its source and MIT license are under `extension/`. Google OAuth verification is pending; this repository does not assert approval.

## Local repairs

The Gmail integration uses `code_verifier` for PKCE, requests offline access, converts Raycast token lifetimes into absolute Google expiration timestamps, and keeps saved refresh tokens after temporary failures. The patch is included at [`extension/gmail-repair.patch`](extension/gmail-repair.patch).

## Extension checks

From `extension/`, install its dependencies and run `npm test -- --runInBand` and `npx ray build -e dist -o ./build-output`. The source was tested locally with 46 passing tests and a successful Raycast/TypeScript build.
