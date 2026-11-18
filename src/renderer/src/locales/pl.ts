import common from './pl/common';
import online from './pl/online';
import navigation from './pl/navigation';
import library from './pl/library';
import player from './pl/player';
import tools from './pl/tools';
import settings from './pl/settings';
import plugins from './pl/plugins';
import compact from './pl/compact';

export default {
  ...common,
  ...online,
  ...navigation,
  ...library,
  ...player,
  ...tools,
  ...settings,
  ...plugins,
  ...compact
};
