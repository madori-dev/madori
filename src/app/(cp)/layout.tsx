// Force dynamic rendering for all CP routes — they require authentication
// and depend on runtime state (session cookies, file system).
export const dynamic = 'force-dynamic'

export default function CPGroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
