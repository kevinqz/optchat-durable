# Release process

[Documentation index](../README.md) · [Validation](./validation.md) · [Changelog](../../CHANGELOG.md)

Releases are published manually on GitHub. A Git tag supplies the Pi source package; a verified compiled tarball supplies standalone and SDK consumers. They must refer to the same reviewed source revision. No push automatically publishes a package or performs an npm-registry release.

## Prepare the change

1. Review the source and public behavior. Resolve failures in the supported macOS/Ubuntu × Node 22.19/24 matrix.
2. Decide the version and prerelease status. The project is pre-1.0; describe compatibility changes explicitly. Do not promote an engineering candidate to a measured quality/performance claim without the evidence in the [conformance review](../reference/conformance.md).
3. Update `package.json`, both root version fields in `package-lock.json`, and `CITATION.cff` together. Set the citation release date and move applicable Unreleased notes into the versioned changelog section.
4. Update version-pinned install examples in both READMEs and the guides. Preserve historical version references in provenance, migration notes and validation history. Do not do an indiscriminate repository-wide version replacement.
5. If Pi dependencies change, check current official APIs, peer conventions, attribution and upstream license notices. Keep exact runtime/development versions and an updated lockfile. The `*` host-peer ranges follow Pi's loader convention; they are not proof of compatibility with every host version.
6. Review task/document compatibility. Update with pending work settled and backups available. An incompatible schema requires an explicit migration or a new store; never silently reinterpret existing durable state.

## Verify and retain the artifact

From a clean checkout of the intended source revision:

```sh
npm ci
npm run check
npm run build
npm run check:pi
npm run check:package -- --output /absolute/path/to/new-release-directory
```

`check:package` builds, packs, validates the allowlist and attribution, and exercises a fresh consumer before retaining the **exact tested tarball** and its SHA-256 file. It refuses to replace an existing artifact. Do not run another `npm pack` and upload a different, untested archive afterward.

Confirm a clean source checkout and record the commit ID, commands, platforms, Node/Pi versions, CI URL and artifact checksum. If source or packaged documentation changes, rebuild and verify the final artifact. Public artifacts must contain no `.env`, history, personal paths or private transcripts. Tests use synthetic data and do not qualify paid inference.

## Publish and verify distribution

1. Create a versioned tag on the verified commit. Do not move, delete or force-update a published release tag.
2. Install that tag with the distributed Pi CLI in an isolated profile. Verify ordinary prompts and `optchat_memory`, then remove it. Record the resolved commit. Do not use a maintainer's personal login or histories for a release smoke test.
3. Create the GitHub release with the correct prerelease flag, installation instructions, behavior changes, validation evidence, attribution and known limits. Upload the retained tarball and checksum.
4. Download the public artifacts and verify the checksum again. Check that the documented Git tag and artifact URLs resolve to what was tested.
5. Link the release and evidence from the corresponding PR. Keep the review's status distinct from publication or merge status.

Consumers use `pi install git:github.com/kevinqz/optchat-durable@<tag>` for Pi, or the complete release tarball URL with `npm install` for standalone/SDK. Publishing to the npm registry would be a separate release decision with its own access/provenance checks; do not document the bare npm package as available before it is published.

## Upgrade and rollback guidance

Consumers should settle pending work, close Pi/the app and back up both host transcripts and complete OptChat stores. Removing a package does not remove those stores. Downgrading code over newer durable state is not a guaranteed rollback; restore a separately verified compatible backup. State within-version recovery evidence separately from cross-version migration qualification.
