'use client'

import DefinitionForm from '../../components/DefinitionForm'

export default function CreateFormPage() {
  return (
    <DefinitionForm
      entityType="forms"
      mode="create"
      listPath="/cp/forms"
      title="Create Form"
    />
  )
}
