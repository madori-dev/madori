import * as fs from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import { extract as tarExtract } from 'tar'

const STARTERS_REPO = 'madori-dev/madori-starters'
const TARBALL_URL = `https://api.github.com/repos/${STARTERS_REPO}/tarball/main`

export const AVAILABLE_STARTERS = ['marketing', 'blog', 'documentation', 'saas', 'agency'] as const
export type StarterName = typeof AVAILABLE_STARTERS[number]

/**
 * Type guard to check if a string is a valid starter name.
 */
export function isValidStarter(name: string): name is StarterName {
  return (AVAILABLE_STARTERS as readonly string[]).includes(name)
}

/**
 * Downloads and extracts a starter package from the Madori starters GitHub repository.
 *
 * Uses the GitHub API tarball endpoint to fetch the repo, then extracts only the
 * subdirectory matching the requested starter name into targetDir.
 *
 * If the download fails (network error, 404, etc.), logs a warning and returns
 * without throwing, allowing the caller to fall back to a blank scaffold.
 */
export async function downloadStarter(name: StarterName, targetDir: string): Promise<void> {
  try {
    const response = await fetch(TARBALL_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'create-madori-app',
      },
    })

    if (!response.ok) {
      console.warn(
        `  ⚠ Could not download starter "${name}" (HTTP ${response.status}). Falling back to blank project.`
      )
      return
    }

    if (!response.body) {
      console.warn(
        `  ⚠ Empty response when downloading starter "${name}". Falling back to blank project.`
      )
      return
    }

    // Ensure target directory exists
    fs.mkdirSync(targetDir, { recursive: true })

    // The tarball from GitHub has a top-level directory like "madori-dev-madori-starters-<sha>/"
    // We need to strip that prefix and only extract the starter subdirectory.
    // tar's `strip` option removes leading path components, and `filter` selects entries.

    // GitHub tarballs always have exactly one top-level directory: "{org}-{repo}-{short-sha}/"
    // We use tar's filter to match entries under "<top-level>/<starter-name>/" and
    // strip 2 components to place files directly in targetDir.

    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
      createGunzip(),
      tarExtract({
        cwd: targetDir,
        strip: 2,
        filter: (entryPath: string) => {
          // The entry path looks like: "org-repo-sha/starter-name/..."
          // After the first component, check if it starts with our starter name
          const parts = entryPath.split('/')
          // parts[0] = top-level dir, parts[1] = starter subdirectory
          return parts.length > 2 && parts[1] === name
        },
      })
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `  ⚠ Failed to download starter "${name}": ${message}. Falling back to blank project.`
    )
  }
}
