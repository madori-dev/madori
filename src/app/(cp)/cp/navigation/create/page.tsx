'use client'

import DefinitionForm from '../../components/DefinitionForm'

export default function CreateNavigationPage() {
  return (
    <DefinitionForm
      entityType="navigations"
      mode="create"
      listPath="/cp/navigation"
      title="Create Navigation"
    />
  )
}
