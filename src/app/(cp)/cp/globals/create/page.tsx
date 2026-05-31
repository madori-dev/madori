'use client'

import DefinitionForm from '../../components/DefinitionForm'

export default function CreateGlobalPage() {
  return (
    <DefinitionForm
      entityType="globals"
      mode="create"
      listPath="/cp/globals"
      title="Create Global"
    />
  )
}
