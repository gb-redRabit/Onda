import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Łączy klasy i usuwa konflikty Tailwind (`px-3` + `px-9` → `px-9`).
 * Komponenty `ui/` używają tego, żeby klasa przekazana z zewnątrz mogła
 * nadpisać wariant bez walki o kolejność w arkuszu.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
