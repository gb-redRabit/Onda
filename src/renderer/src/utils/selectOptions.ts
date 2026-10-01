/**
 * Czyta wartość `<select>` jako jedną z wartości, które faktycznie oferują jego opcje.
 *
 * Wszystkie selecty ustawień typowały surowe `.value` rzutowane na `any`, co oznaczało,
 * że unia na polu ustawień (`'best' | 'high' | 'medium' | 'low'` i podobne)
 * nigdy nie była faktycznie sprawdzana: zmiana nazwy opcji albo wartość przychodząca
 * z nieaktualnego pliku ustawień wpływała prosto do store i zawodziła dopiero później,
 * gdzie indziej.
 *
 * `allowed` to ta sama tablica, po której iteruje szablon, więc walidacja i renderowanie
 * nie mogą się rozjechać. Nieoczekiwana wartość wycofuje się do pierwszej opcji, zamiast
 * zatruwać store.
 */
export function readSelect<T extends string>(event: Event, allowed: readonly T[]): T {
  const value = (event.target as HTMLSelectElement | null)?.value;
  return allowed.includes(value as T) ? (value as T) : allowed[0];
}
