# Incident response

## First response

1. Assign incident lead and record UTC timeline.
2. Stop destructive activity. For integrity incidents, remove Control Panel writer from traffic before collecting evidence.
3. Preserve application logs, deployed commit SHA, lockfile, health output, and a current checksummed backup.
4. Classify impact: availability, content integrity, credential exposure, or dependency compromise.
5. Restore service through known-good code rollback or verified data restore. Keep evidence and rollback copies.

## Credential or session exposure

1. Stop affected instance and restrict access.
2. Rotate hosting, Git, registry, and third-party credentials through their secret managers.
3. Invalidate sessions using the configured store. For the default file store, remove session records from `auth.storeConfig.sessionsDir`, or the `.sessions` directory beside the configured content root when no override exists. Do not assume the checkout's `.sessions/` is active. Custom stores require their own revocation procedure; then restart the application.
4. Reset affected user passwords through the application and review role assignments. Password changes and account deletion revoke that user's sessions; replacing account files outside the application does not invoke its lifecycle hooks.
5. Search logs and Git history for leaked values; do not paste secrets into tickets or chat.

## Content corruption

1. Stop all writers.
2. Back up corrupted state for diagnosis.
3. Identify last verified archive and expected Git content revision.
4. Restore into isolated environment first; compare content-owner-selected records.
5. Restore production, run schema check and smoke tests, then reopen writes.

## Vulnerability response

1. Confirm affected package and reachable code path.
2. For high or critical reachable issues, disable affected surface or remove instance from public traffic until patched.
3. Update dependency and lockfile through pnpm, run complete release gate, and deploy exact tested commit.
4. Document exposure window and indicators checked. Notify affected parties when confidentiality or integrity may have been impacted.

## Closure

Record root cause, user impact, detection gap, recovery duration, lost-data window, and owned follow-up actions. Add regression test or monitoring signal for every preventable recurrence.
