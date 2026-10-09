/** Faza w edytorze źródła (szyna po lewej): Źródło → endpointy → Test. */
export interface PhaseItem {
  key: string;
  kind: 'source' | 'endpoint' | 'test';
  label: string;
  type?: 'list' | 'page';
  status?: 'ok' | 'fail' | 'invalid' | null;
}
