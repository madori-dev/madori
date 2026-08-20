/** In-memory reverse dependency index. Consumers can persist it independently. */
export class SeoAuditDependencyGraph {
  private readonly dependencies = new Map<string, Set<string>>()
  private readonly dependents = new Map<string, Set<string>>()

  replace(subjectId: string, dependencyIds: readonly string[] = []): void {
    const prior = this.dependencies.get(subjectId) ?? new Set<string>()
    for (const dependency of prior) {
      const subjects = this.dependents.get(dependency)
      subjects?.delete(subjectId)
      if (subjects?.size === 0) this.dependents.delete(dependency)
    }
    const next = new Set(dependencyIds.filter(Boolean))
    this.dependencies.set(subjectId, next)
    for (const dependency of next) {
      const subjects = this.dependents.get(dependency) ?? new Set<string>()
      subjects.add(subjectId)
      this.dependents.set(dependency, subjects)
    }
  }

  sync(subjects: ReadonlyArray<{ id: string; dependencies?: readonly string[] }>): void {
    const known = new Set(subjects.map(subject => subject.id))
    for (const id of this.dependencies.keys()) if (!known.has(id)) this.remove(id)
    for (const subject of subjects) this.replace(subject.id, subject.dependencies)
  }

  affectedBy(changedIds: readonly string[]): string[] {
    const affected = new Set(changedIds.filter(Boolean))
    const pending = [...affected]
    while (pending.length > 0) {
      const changed = pending.shift()!
      for (const subject of this.dependents.get(changed) ?? []) {
        if (!affected.has(subject)) { affected.add(subject); pending.push(subject) }
      }
    }
    return [...affected].sort()
  }

  private remove(subjectId: string): void {
    this.replace(subjectId, [])
    this.dependencies.delete(subjectId)
  }
}
