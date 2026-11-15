// UI choices never grant membership. The native conversation/composer enforce send rights.
export function canExecuteInChannel(channel,viewer) {
 return !!viewer&&!!channel&&!channel.archived&&!channel.readOnly&&!channel.cached&&!channel.pending&&!channel.metadataPending&&!channel.metadataCached&&channel.members?.includes(viewer)&&['solo','stream','forum'].includes(channel.channelType);
}
