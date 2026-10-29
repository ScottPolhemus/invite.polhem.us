/** The confirmation shown before deleting an event, warning about the user's invitations that point at it */
export function deleteEventMessage(name: string | null, invitations: number) {
  const warning =
    invitations === 1
      ? ' 1 of your invitations points at it and will lose its details.'
      : invitations > 1
        ? ` ${invitations} of your invitations point at it and will lose their details.`
        : ''
  return `Delete ${name ? `“${name}”` : 'this event'}?${warning} Invitations and RSVPs from other people can't be changed.`
}
