export default function PageHeader({
  heading,
  subHeading,
  body,
}: {
  heading?: string
  subHeading?: string
  body?: string
}) {
  return (
    <div className="border-foreground m-4 border p-4 font-sans">
      {!!heading && <h1 className="text-4xl">{heading}</h1>}
      {!!subHeading && <h2 className="text-2xl">{subHeading}</h2>}
      {!!body && <p>{body}</p>}
    </div>
  )
}
