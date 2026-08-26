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
3. Remove `.sessions/` contents to invalidate active file sessions, then restart application.
4. Reset affected user passwords and review role assignments.
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
