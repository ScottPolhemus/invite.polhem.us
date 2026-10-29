/** A full-width note at the top of a page, shown to someone with extra abilities there */
export default function NoticeBanner({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      role="note"
      className="bg-foreground text-background page-section py-3! text-lg"
    >
      <div className="page-content">{children}</div>
    </div>
  )
}
