import PageHeader from './_components/page-header'

export default function Home() {
  return (
    <>
      <PageHeader
        heading={'Polhem.us Invite'}
        subHeading={'Description'}
        body={'Custom invitations for Atmosphere events'}
      />
      <button className="bg-foreground text-background mx-4 rounded-full p-2">
        Sign in to create an invitation
      </button>
    </>
  )
}
