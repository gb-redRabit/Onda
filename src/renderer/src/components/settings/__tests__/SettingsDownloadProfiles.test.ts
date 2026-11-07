import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive, ref } from 'vue';
import SettingsDownloadProfiles from '../SettingsDownloadProfiles.vue';

// Profil pobierania: store, dialog i komponenty UI są podstawione.
const state = vi.hoisted(() => ({
  settings: null as any,
  profiles: null as any,
  ensureLoaded: vi.fn(),
  saveProfile: vi.fn(async () => undefined),
  removeProfile: vi.fn(async () => undefined),
  prompt: null as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useDownloadProfiles', () => ({
  useDownloadProfiles: () => ({
    profiles: state.profiles,
    ensureLoaded: state.ensureLoaded,
    save: state.saveProfile,
    remove: state.removeProfile
  })
}));
vi.mock('@renderer/composables/usePromptDialog', () => ({
  usePromptDialog: () => state.prompt
}));

const SettingsGroupStub = { template: '<div><slot /></div>' };
const ButtonStub = { template: '<button><slot /></button>' };
const IconButtonStub = { template: '<button><slot /></button>' };
const InputStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input />'
};
const NumberFieldStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input type="number" />'
};
const SelectStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<select><slot /></select>'
};
const PromptStub = { template: '<div />' };

let wrapper: VueWrapper | null = null;

function mountProfiles() {
  wrapper = mount(SettingsDownloadProfiles, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SettingsGroup: SettingsGroupStub,
        Button: ButtonStub,
        IconButton: IconButtonStub,
        Input: InputStub,
        NumberField: NumberFieldStub,
        Select: SelectStub,
        ExplorerPromptDialog: PromptStub
      }
    }
  });
  return wrapper;
}

function selects(): any[] {
  return wrapper!.findAllComponents(SelectStub);
}

async function setProfileName(name: string): Promise<void> {
  wrapper!.findComponent(InputStub).vm.$emit('update:modelValue', name);
  await wrapper!.vm.$nextTick();
}

async function clickSave(): Promise<void> {
  await wrapper!.get('[data-testid="settings-profile-save"]').trigger('click');
  await wrapper!.vm.$nextTick();
}

beforeEach(() => {
  state.settings = reactive({
    download: {
      defaultKind: 'audio' as 'audio' | 'video',
      defaultAudioFormat: 'mp3',
      defaultVideoQuality: '1080',
      defaultVideoContainer: 'mp4' as 'mp4' | 'mkv' | 'webm',
      defaultAudioQuality: 'best',
      defaultCover: 'thumbnail' as 'thumbnail' | 'none' | 'frame' | 'clip'
    }
  });
  state.profiles = ref([
    {
      id: 'p1',
      name: 'Video profile',
      config: {
        kind: 'video',
        quality: '720',
        videoContainer: 'mkv',
        audioQuality: 'high',
        cover: { type: 'frame', frameTime: 12 }
      }
    }
  ]);
  state.ensureLoaded.mockClear();
  state.saveProfile.mockReset();
  state.saveProfile.mockResolvedValue(undefined);
  state.removeProfile.mockReset();
  state.removeProfile.mockResolvedValue(undefined);
  state.prompt = {
    promptVisible: ref(false),
    promptIsConfirm: ref(false),
    promptMessage: ref(''),
    promptValue: ref(''),
    promptConfirm: vi.fn(),
    promptCancel: vi.fn(),
    showConfirm: vi.fn(async () => true)
  };
  state.t.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('initial state and defaults', () => {
  it('loads profiles and starts from global defaults', () => {
    mountProfiles();
    expect(state.ensureLoaded).toHaveBeenCalled();
    expect(selects()).toHaveLength(5); // profil, kind, format, audioQuality, cover
  });

  it('shows video fields only for video profiles', async () => {
    mountProfiles();
    selects()[1].vm.$emit('update:modelValue', 'video');
    await wrapper!.vm.$nextTick();

    // profil, kind, quality, container, cover
    expect(selects()).toHaveLength(5);
    expect(selects()[2].props('modelValue')).toBe('1080');
    expect(selects()[3].props('modelValue')).toBe('mp4');
  });
});

describe('saving', () => {
  it('saves an audio profile with the default thumbnail cover', async () => {
    mountProfiles();
    await setProfileName('My audio');
    await clickSave();

    expect(state.saveProfile).toHaveBeenCalledWith(
      'My audio',
      {
        kind: 'audio',
        audioQuality: 'best',
        format: 'mp3',
        cover: { type: 'thumbnail' }
      },
      undefined
    );
    // Formularz wyczyszczony — kolejny klik nie zapisuje.
    await clickSave();
    expect(state.saveProfile).toHaveBeenCalledTimes(1);
  });

  it('builds a video config with quality and container', async () => {
    mountProfiles();
    selects()[1].vm.$emit('update:modelValue', 'video');
    await wrapper!.vm.$nextTick();
    selects()[2].vm.$emit('update:modelValue', '720');
    selects()[3].vm.$emit('update:modelValue', 'mkv');
    await setProfileName('My video');
    await clickSave();

    expect(state.saveProfile).toHaveBeenCalledWith(
      'My video',
      {
        kind: 'video',
        audioQuality: 'best',
        quality: '720',
        videoContainer: 'mkv',
        cover: { type: 'thumbnail' }
      },
      undefined
    );
  });

  it('supports none, frame and clip covers', async () => {
    mountProfiles();
    await setProfileName('A');
    selects()[4].vm.$emit('update:modelValue', 'none');
    await wrapper!.vm.$nextTick();
    await clickSave();
    expect(state.saveProfile).toHaveBeenCalledWith(
      'A',
      expect.not.objectContaining({ cover: expect.anything() }),
      undefined
    );

    state.saveProfile.mockClear();
    selects()[4].vm.$emit('update:modelValue', 'frame');
    await wrapper!.vm.$nextTick();
    wrapper!.findComponent(NumberFieldStub).vm.$emit('update:modelValue', 15);
    await setProfileName('B');
    await clickSave();
    expect(state.saveProfile).toHaveBeenCalledWith(
      'B',
      expect.objectContaining({ cover: { type: 'frame', frameTime: 15 } }),
      undefined
    );

    state.saveProfile.mockClear();
    selects()[4].vm.$emit('update:modelValue', 'clip');
    await wrapper!.vm.$nextTick();
    const numbers = wrapper!.findAllComponents(NumberFieldStub);
    numbers[0].vm.$emit('update:modelValue', 2);
    numbers[1].vm.$emit('update:modelValue', 8);
    selects().at(-1)!.vm.$emit('update:modelValue', 'mp4');
    await setProfileName('C');
    await clickSave();
    expect(state.saveProfile).toHaveBeenCalledWith(
      'C',
      expect.objectContaining({
        cover: { type: 'clip', clipStart: 2, clipEnd: 8, clipFormat: 'mp4' }
      }),
      undefined
    );
  });

  it('ignores empty and whitespace names', async () => {
    mountProfiles();
    await setProfileName('   ');
    await clickSave();
    expect(state.saveProfile).not.toHaveBeenCalled();
  });
});

describe('selecting and deleting profiles', () => {
  it('loads an existing profile into the form and updates it', async () => {
    mountProfiles();
    selects()[0].vm.$emit('update:modelValue', 'p1');
    await wrapper!.vm.$nextTick();

    expect(wrapper!.findComponent(InputStub).props('modelValue')).toBe('Video profile');
    expect(selects()[1].props('modelValue')).toBe('video');
    expect(selects()[4].props('modelValue')).toBe('frame');

    selects()[1].vm.$emit('update:modelValue', 'audio');
    await wrapper!.vm.$nextTick();
    await clickSave();
    expect(state.saveProfile).toHaveBeenCalledWith(
      'Video profile',
      expect.objectContaining({ kind: 'audio', audioQuality: 'high' }),
      'p1'
    );
  });

  it('resets the form when the selection is cleared', async () => {
    mountProfiles();
    selects()[0].vm.$emit('update:modelValue', 'p1');
    await wrapper!.vm.$nextTick();
    selects()[0].vm.$emit('update:modelValue', '');
    await wrapper!.vm.$nextTick();

    expect(wrapper!.findComponent(InputStub).props('modelValue')).toBe('');
    expect(selects()[1].props('modelValue')).toBe('audio');
  });

  it('deletes a profile only after confirmation', async () => {
    mountProfiles();
    const deleteButton = wrapper!.findAllComponents(IconButtonStub)[0];
    await deleteButton.trigger('click');
    expect(state.prompt.showConfirm).not.toHaveBeenCalled();

    selects()[0].vm.$emit('update:modelValue', 'p1');
    await wrapper!.vm.$nextTick();
    state.prompt.showConfirm.mockResolvedValueOnce(false);
    await deleteButton.trigger('click');
    expect(state.prompt.showConfirm).toHaveBeenCalledWith('settings.profileDeleteConfirm');
    expect(state.t).toHaveBeenCalledWith('settings.profileDeleteConfirm', {
      name: 'Video profile'
    });
    expect(state.removeProfile).not.toHaveBeenCalled();

    state.prompt.showConfirm.mockResolvedValueOnce(true);
    await deleteButton.trigger('click');
    await wrapper!.vm.$nextTick();
    expect(state.removeProfile).toHaveBeenCalledWith('p1');
    expect(wrapper!.findComponent(InputStub).props('modelValue')).toBe('');
  });
});
