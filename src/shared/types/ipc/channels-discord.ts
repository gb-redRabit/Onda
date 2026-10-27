import type { DiscordCoverQuery, DiscordStatus } from '../discord';

export interface DiscordChannels {
  'discord:configure': {
    args: [options: { enabled: boolean; clientId: string }];
    result: void;
  };
  'discord:getStatus': {
    args: [];
    result: DiscordStatus;
  };
  'discord:resolveCover': {
    args: [query: DiscordCoverQuery];
    result: string | null;
  };
  'discord:resolveLocalCover': {
    args: [filePath: string];
    result: string | null;
  };
}
