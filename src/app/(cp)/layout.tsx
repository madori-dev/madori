// Force dynamic rendering for all CP routes — they require authentication
// and depend on runtime state (session cookies, file system).
export const dynamic = 'force-dynamic'

import { CPThemeProvider } from '@/components/cp/CPThemeProvider'

export default function CPGroupLayout({ children }: { children: React.ReactNode }) {
  return <CPThemeProvider>{children}</CPThemeProvider>
}
