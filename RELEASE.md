# Wydanie

Wersję ustala **release-please**. Ten dokument opisuje przepływ i — co ważniejsze —
co **nie wolno** robić ręcznie.

## 1. Przepływ

```
push na main (commity Conventional Commits)
   └─> .github/workflows/release.yml
        └─> release-please otwiera PR "chore(main): release X.Y.Z"
             ├─ podnosi wersję w package.json
             ├─ dopisuje sekcję do CHANGELOG.md
             └─ aktualizuje .release-please-manifest.json
   └─> merge PR-a release-please
        └─> release-please tworzy tag vX.Y.Z + GitHub Release
             └─> tag odpala .github/workflows/build.yml (`on: push: tags: v*`)
                  └─> instalatory NSIS / dmg / AppImage / deb / rpm
```

Wersja jest wyliczana z typów commitów od ostatniego release'a:

| Commit                                                             | Bump                |
| ------------------------------------------------------------------ | ------------------- |
| `feat:`                                                            | minor               |
| `fix:`                                                             | patch               |
| `perf:`                                                            | patch               |
| `BREAKING CHANGE:` w stopce                                        | major               |
| `refactor:`, `chore:`, `test:`, `ci:`, `docs:`, `build:`, `style:` | nic (sekcja ukryta) |

Sześć commitów `feat:` od `v0.4.3` daje więc `0.5.0` — to nie jest błąd, tylko minor
dla wydania z nowymi funkcjami.

## 2. Zasada: release-please jest jedynym właścicielem wersji

**Nigdy nie uruchamiaj `npm version` na `main`.**

`package.json` trzyma na `main` wersję **ostatnio opublikowanego** release'a
(np. `0.4.3` w tygodniu, w którym `v0.4.4` już istnieje). Wersję podnosi wyłącznie
commit release-please.

Ręczny bump tworzy dokładnie ten problem: repo twierdzi jedną wersję, release-please
wyliczył inną. Wyjście jest niespójne — użytkownik instaluje build z inną wersją niż
pokazuje repo, a `latest.yml` wskazuje na asset, którego nikt nie wypchnął.

To nie jest teoria — tak skończyło się wydanie 0.4.4: ręczny bump dał `0.4.4`,
release-please z tych samych commitów wyliczył `0.5.0`, a tag `v0.4.4` nigdy nie
powstał.

## 3. Guard w CI

`npm run version:check` pilnuje niezmiennika **stanowego** (nie opiera się na zaufaniu
do opisu commita):

```
package.json === .release-please-manifest.json
AND wersja jest albo
  (a) najnowszym tagiem v*                — brak release'a w toku
  (b) nowsza, ale zapisana commitem `chore(main): release X.Y.Z`
                                        — PR zmergowany, tag jeszcze nie wypchnięty
```

Wariant (b) istnieje, bo release-please taguje **po** merge PR-a: okno między merge
a push tagiem nie może być czerwone. Wszystko inne — czyli ręczna edycja — kończy
się błędem CI.

Skrypt ma własne testy (`scripts/__tests__/check-version.test.ts`), które uruchamiają
go na throwaway repozytoriach, w tym na dokładnie tym regresyjnym przypadku.

Pozostałe guardy repozytorium:

| Polecenie                 | Co pilnuje                                             |
| ------------------------- | ------------------------------------------------------ |
| `npm run version:check`   | wersję ustawia release-please                          |
| `npm run check:catch`     | brak pustych bloków `catch`                            |
| `npm run ipc:gen:check`   | wygenerowane pliki IPC nie rozjechały się z kontraktem |
| `npm run check:artifacts` | testy nie zostawiają plików w repo (patrz niżej)       |
| `npm run format:check`    | formatowanie Prettier                                  |
| `npm run lint`            | ESLint                                                 |

`check:artifacts` istnieje, bo test zapisujący plik przez `process.env.TEMP`
(fallback `'.'`) wrzucił `onda-radio-test.json` do katalogu repo i wywrócił
`format:check` na każdym runnerze, gdzie `TEMP` nie istnieje — czyli na Linux i macOS,
a nie na Windowsie, gdzie test „przechodził".

## 4. Wymuszenie konkretnej wersji

To decyzja semantyczna, nie techniczna. Warianty:

1. **Wersja ma być wyższa niż wyliczona** — zmień typ commita na `feat:` albo dodaj
   `BREAKING CHANGE:`, zanim release-please otworzy PR.
2. **Chcesz patch zamiast minor** — nie używaj `feat:`. Opisz zmianę jako `fix:` lub
   `perf:`. To zmiana komunikatu commita, nie ręczna edycja wersji.
3. **Potrzebujesz wersji spoza semantyki Conventional Commits** — wyłącz release-please
   w `.github/workflows/release.yml` i przejmij wersjonowanie ręcznie. Wtedy
   `version:check` trzeba usunąć, bo jego niezmiennik przestaje obowiązywać.

Poza tym: `v0.5.0` jako `0.5.0` jest w pełni prawidłowe i nie wymaga żadnej pracy.

## 5. Dlaczego `fetch-depth: 0`

Guard porównuje drzewo z najnowszym tagiem `v*`, więc tagi muszą być obecne. Domyślne
`fetch-depth: 1` w `actions/checkout` nie dostarcza tagów — guard by ich „nie znalazł"
i przepuszczał wszystko, czyli pozorny bezpiecznik. Historia ma ~350 commitów, więc
pełny fetch nic nie kosztuje.

## 6. Podpisywanie instalatorów

Kod podpisu **nie jest włączony**:

- `electron-builder.yml` → `win.verifyUpdateCodeSignature: false`
- `electron-builder.yml` → `mac.notarize: false`

Konsekwencja dla supply-chain: dopóki instalatory są niepodpisane, `electron-updater`
przyjmuje aktualizację bez weryfikacji podpisu. Jedynym zabezpieczeniem dystrybucji
jest kanał GitHub Releases + `GH_TOKEN` w CI. Użytkownik zobaczy „Unknown publisher"
w SmartScreen i „niezidentyfikowany deweloper" w Gatekeeper.

Aby włączyć podpisywanie:

1. Windows — certyfikat Authenticode; ustaw `CSC_LINK` + `CSC_KEY_PASSWORD`,
   `CODE_SIGN_PUBLISHER` (subject certyfikatu) i przełącz
   `verifyUpdateCodeSignature: true`. `publisherName` musi być zgodny z subjectem.
2. macOS — Apple Developer ID; `CSC_LINK` + `CSC_KEY_PASSWORD`, `APPLE_ID`,
   `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` i `notarize: true`.
3. Oba zdarzenia w tej samej zmianie co `verifyUpdateCodeSignature: true` — włączanie
   weryfikacji podpisu bez certyfikatu odrzuca własne, niespodpisane buildy.

Nie dodawaj pustych `CSC_LINK` / `CSC_KEY_PASSWORD`: electron-builder traktuje nawet
pustą `CSC_LINK` jako ścieżkę do certyfikatu i przerywa build (macOS: „not a file").

## 7. Tryby awarii

| Objaw                                                           | Przyczyna                                                                           | Postępowanie                                                                                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version:check` FAILED po wypchnięciu `chore(release): X`       | ręczny bump na `main`                                                               | `git checkout <poprzedni_release_commit> -- package.json package-lock.json .release-please-manifest.json`, usuń ręczny wpis z CHANGELOG, wypchnij poprawkę |
| Release jest `0.5.0`, a chciałeś `0.4.4`                        | `feat:` w commitach → minor                                                         | poprawne; zobacz §4                                                                                                                                        |
| Guard przechodzi mimo ręcznej zmiany w commicie niebędącym HEAD | `fetch-depth: 1`                                                                    | ustaw `fetch-depth: 0` (zobacz §5)                                                                                                                         |
| release-please nie otwiera PR-a po pushu                        | brak `GH_TOKEN` z `contents: write`, albo manifest wskazuje już opublikowaną wersję | sprawdź `permissions` w `release.yml` i log akcji Release                                                                                                  |
| `format:check` zgłasza plik, którego nie ma w `git status`      | test zostawił artefakt w katalogu repo                                              | `npm run check:artifacts` wskaże plik; napisz test tak, by używał `os.tmpdir()`                                                                            |
| Brak `latest.yml` przy działającej aktualizacji                 | target nie jest tym, którego używa electron-updater (Windows: `nsis`, macOS: `zip`) | porównaj targety w `electron-builder.yml`                                                                                                                  |
