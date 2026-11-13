import { describe, expect, it } from 'vitest';

import { HomeModule } from '../HomeModule';
import { SettingsModule } from '../SettingsModule';
import { SourcesModule } from '../SourcesModule';
import { ToolsModule } from '../ToolsModule';

const cases = [
  { name: 'Home', Ctor: HomeModule },
  { name: 'Settings', Ctor: SettingsModule },
  { name: 'Sources', Ctor: SourcesModule },
  { name: 'Tools', Ctor: ToolsModule }
] as const;

describe.each(cases)('$name module', ({ name, Ctor }) => {
  it('starts inactive and exposes its identity', () => {
    const module = new Ctor();

    expect(module.isActive()).toBe(false);
    expect(module.id).toBe(name.toLowerCase());
    expect(module.name).toBe(name);
  });

  it('activates and deactivates', async () => {
    const module = new Ctor();

    module.activate();
    expect(module.isActive()).toBe(true);

    await module.deactivate();
    expect(module.isActive()).toBe(false);
  });

  it('ignores an activation context', () => {
    const module = new Ctor();

    module.activate({ some: 'context' });

    expect(module.isActive()).toBe(true);
  });
});
