/**
 * Bezpieczne sloty UI dla wtyczek.
 *
 * Wtyczka NIE renderuje własnego DOM/HTML — host pokazuje wyłącznie
 * znormalizowane pary `label`/`value` jako tekst. Dzięki temu payload jest
 * ograniczony rozmiarem, znormalizowany i renderowany przez interpolację Vue
 * (bez `v-html`), więc nie ma miejsca na wstrzyknięcie znaczników.
 *
 * Dostęp do slotu wymaga `permissions.visual === true` w manifeście wtyczki
 * ORAZ wpisu slotu w `manifest.uiSlots` (pole wchodzi do consent-hash, więc
 * dodanie go wymaga ponownego zatwierdzenia przez użytkownika).
 */

/** Sloty, które host umie wyrenderować. */
export const PLUGIN_UI_SLOT_IDS = ['audio-view'] as const;

export type PluginUiSlotId = (typeof PLUGIN_UI_SLOT_IDS)[number];

/** Twarde limity hostowe — payload większy niż to jest odrzucany, nie przycinany. */
export const PLUGIN_SLOT_LIMITS = {
  maxItems: 8,
  maxLabelChars: 48,
  maxValueChars: 160
} as const;

export interface PluginSlotItem {
  label: string;
  value: string;
}

/** Czy `name` jest slotem hostowym. */
export function isPluginUiSlot(name: string): name is PluginUiSlotId {
  return (PLUGIN_UI_SLOT_IDS as readonly string[]).includes(name);
}

/**
 * Usuwa znaki sterujące (w tym `\n`, `\r`, `\t`) i normalizuje spacje, żeby
 * pojedyncza linia tekstu nie mogła namieszać w layoucie ani w logach.
 */
function normalizeText(value: unknown, maxChars: number): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

/**
 * Waliduje payload slotu. Zwraca `null` gdy lista jest pusta lub przekracza
 * limity — wtedy slot zostaje wyczyszczony zamiast pokazywać ucięte dane.
 */
export function sanitizeSlotItems(input: unknown): PluginSlotItem[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length === 0) return null;
  if (input.length > PLUGIN_SLOT_LIMITS.maxItems) throw new Error('ui-slot:too-many-items');
  const items: PluginSlotItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('ui-slot:invalid-item');
    }
    const record = raw as Record<string, unknown>;
    const label = normalizeText(record.label, PLUGIN_SLOT_LIMITS.maxLabelChars);
    const value = normalizeText(record.value, PLUGIN_SLOT_LIMITS.maxValueChars);
    if (!label && !value) continue;
    items.push({ label, value });
  }
  return items.length ? items : null;
}
