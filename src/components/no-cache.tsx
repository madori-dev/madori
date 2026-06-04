import { headers } from 'next/headers'

interface NoCacheProps {
  section: string
  children: React.ReactNode
}

export async function NoCache({ section, children }: NoCacheProps) {
  const headersList = await headers()
  const isServingFromCache = headersList.get('x-madori-cached') === '1'

  if (isServingFromCache) {
    return (
      <div
        data-nocache-section={section}
        data-nocache-endpoint={`/_nocache/${section}`}
      />
    )
  }

  return <>{children}</>
}
