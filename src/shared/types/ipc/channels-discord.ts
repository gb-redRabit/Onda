export interface DiscordChannels {
  'discord:configure': {
    args: [options: { enabled: boolean; clientId: string }];
    result: void;
  };
}
