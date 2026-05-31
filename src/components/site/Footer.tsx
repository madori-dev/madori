export function Footer() {
  return (
    <footer className="border-t border-border/50 py-8">
      <div className="mx-auto max-w-5xl px-6">
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Madori. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
