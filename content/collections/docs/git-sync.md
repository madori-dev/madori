---
title: Git Content Sync
slug: git-sync
status: published
createdAt: 2026-08-19T00:00:00.000Z
updatedAt: 2026-08-19T00:00:00.000Z
---

# Git Content Sync

Madori can commit successful Control Panel content changes to Git automatically. It can also push those commits to an existing remote, including GitHub. Git sync is disabled by default and never stores Git credentials.

Git sync is outbound only. Madori does not pull, reset, force-push, resolve merge conflicts, or overwrite a working tree. Keep Git authentication and branch protection configured outside Madori.

## Enable sync

Add `git` to `madori.config.ts`:

```ts
const config = {
  git: {
    enabled: true,
    automatic: true,
    push: true,
    trackedPaths: [
      { root: 'content', exclude: ['forms/**'] },
      { root: 'resources' },
    ],
  },
}

export default config
```

`automatic` queues a commit after a successful content mutation. `push` pushes successful commits to configured `remote` (default `origin`) and `branch` when one is configured. Leave `push: false` when deployment or review process should approve commits separately. See [Configuration](/docs/configuration#git-content-sync) for every option.

## Choose tracked paths

Madori stages only paths listed in `trackedPaths`; unrelated changes in repository are left untouched. Each item accepts built-in roots (`content`, `resources`, `assets`, `users`) or an explicit path. `exclude` patterns are relative to that root.

Default roots track content and resources, while excluding form submissions:

```ts
trackedPaths: [
  { root: 'content', exclude: ['forms/**', '.sessions/**'] },
  { root: 'resources' },
]
```

Review privacy before adding `users` or form data. User files and submissions may contain personal information. Sessions should remain outside Git. Add `assets` only when repository storage and backup policy suit media; use Git LFS or object storage for large files.

## One repository or several

Madori discovers Git root for each tracked path and synchronizes each repository independently. Content and resources can live together:

```text
site/
├── .git/
├── content/
└── resources/
```

They can also live in separate repositories:

```text
site-app/.git/
site-content/.git/content/
site-content/.git/resources/
```

Point roots at the resolved locations when content is external:

```ts
trackedPaths: [
  { root: '../site-content/content', exclude: ['forms/**'] },
  { root: '../site-content/resources' },
]
```

Separate repositories receive separate commits, locks, status entries, and push results. Use absolute or project-relative paths that the running Madori process can read and write.

## Configure GitHub authentication

Initialize each repository, configure its remote and upstream branch, and verify credentials as the same operating-system user that runs Madori:

```bash
git -C /var/www/site-content remote add origin git@github.com:ORG/CONTENT-REPO.git
git -C /var/www/site-content branch --set-upstream-to=origin/main main
git -C /var/www/site-content ls-remote origin
```

Madori invokes Git with non-interactive prompting disabled. Configure SSH keys, an SSH agent, or a credential helper before enabling `push`.

For a single repository, a GitHub SSH deploy key with write access is a narrow option. For several repositories or centrally managed permissions, use a GitHub App installation with the minimum repository contents permissions required. Store private keys and tokens in the host secret manager or Git/SSH configuration, never in `madori.config.ts`, content files, logs, or Control Panel responses. See GitHub's [deploy key guidance](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) and [GitHub App authentication guidance](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-github-apps).

## Debounce, authors, and recovery

Rapid saves are coalesced for `git.debounceMs` milliseconds (default `2000`) so one editing session does not create a commit per keystroke. Authenticated editor identity is used when available; configured bot identity is used for background work. Co-authors are retained when one commit contains changes from multiple editors.

Pending work is persisted under `git.statePath` (default `./storage/git-sync`). On restart, Madori recovers pending commits and records push failures for retry. Each repository has a lock so multiple application workers do not race over `.git/index`; stale locks expire according to `lockTimeoutMs`.

## Control Panel and CLI

Open `/cp/git` to inspect each configured repository. The Git utility shows branch, remote, pending file counts, sync state, and sanitized errors. Use **Sync now** for pending work or **Retry push** after fixing authentication or remote state.

From a Madori source checkout, use:

```bash
pnpm madori git:status
pnpm madori git:sync
pnpm madori git:retry
```

Manual sync and retry do not broaden tracked paths. They stage only configured roots and exclusions.

## Troubleshooting

### Git unavailable or repository not found

Install Git and ensure each tracked root is inside a working tree. Check path permissions for the process user. A path outside any Git repository cannot be synchronized.

### Authentication failure

Run `git ls-remote` as the Madori service user. Check SSH host keys, deploy-key write permission, App installation access, credential-helper scope, and remote URL. Madori redacts credentials from surfaced Git errors.

### Non-fast-forward or divergent branch

Madori leaves failed work pending and does not pull or resolve divergence. Integrate remote changes manually, confirm the working tree, then run `git:retry` or **Retry push**. Never use force-push as an automatic recovery step.

### CI or deployment loop

If pushes trigger deployment, ensure deployment does not write generated files back into tracked roots or invoke another push. Keep build artifacts, sessions, caches, and logs ignored. In a pull-based deployment, deploy the commit that Madori pushed; in a webhook-based deployment, protect against duplicate builds.

## Hosting requirements

Automatic sync requires an always-on process and persistent, writable storage for content, `.git`, and `git.statePath`. Ephemeral serverless filesystems cannot safely run the Control Panel or retain pending synchronization. See [Deployment](/docs/deployment#content-in-git) for hosting patterns and [Configuration](/docs/configuration) for path layout.
