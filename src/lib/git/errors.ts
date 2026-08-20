export class GitError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: string,
  ) {
    super(message)
    this.name = 'GitError'
  }
}

export class GitCommandError extends GitError {
  constructor(message: string, public readonly exitCode: number | null, details?: string) {
    super(message, 'COMMAND_FAILED', details)
    this.name = 'GitCommandError'
  }
}
