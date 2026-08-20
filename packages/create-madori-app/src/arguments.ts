/** Starter packages are not distributed, so reject stale starter flags clearly. */
export function hasUnsupportedStarterFlag(args: readonly string[]): boolean {
  return args.includes('--starter')
}
