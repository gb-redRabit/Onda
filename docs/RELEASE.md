# Procedura wydania (Release)

Poniżej kroki potrzebne do wydania nowej wersji **Onda**.

## 1. Weryfikacja przed wydaniem

Wszystkie poniższe komendy muszą przechodzić bez błędów:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

## 2. Bump wersji

1. Zaktualizuj `version` w `package.json` (zgodnie z SemVer).
2. Zaktualizuj `CHANGELOG.md` — sekcja „[Nieopublikowane]" staje się wydaniem z datą i tagiem.
3. Upewnij się, że wersja w `package.json` zgadza się z tagiem (blokada publikacji przy niezgodności).

## 3. Budowa artefaktów

```bash
# Windows (NSIS installer)
npm run build:win

# macOS (DMG)
npm run build:mac

# Linux (AppImage / snap / deb)
npm run build:linux
```

Artefakty trafiają do `dist/`. Dla każdego artefaktu zweryfikuj:

- poprawny `appId` (`com.onda.app`) i `productName` (`Onda`);
- obecność skojarzeń plików (`fileAssociations`);
- checksumy (SHA-512 w `latest.yml` / osobne pliki).

## 4. Smoke test artefaktu

Po instalacji `dist/onda-<version>-setup.exe`:

1. uruchomienie aplikacji i ekran pierwszego uruchomienia;
2. odtworzenie pliku audio i wideo;
3. otwarcie pliku z systemu (dwuklik) i z drugiej instancji (single-instance);
4. autostart i skojarzenia plików (przy włączonych opcjach);
5. aktualizacja (sprawdzenie wersji) i pobieranie z YouTube.

## 5. Tag i publikacja

1. Utwórz tag zgodny z wersją: `git tag v<version>` i `git push --tags`.
2. Publikacja następuje przez workflow CI (electron-builder z `publish: github`).
3. Po publikacji zweryfikuj `dist/latest.yml` (Windows auto-updater) i wpis release na GitHubie.

## 6. Podpisywanie kodu (gdy dostępne certyfikaty)

Zob. `docs/raport-audytu.md` §6 oraz komentarze w `electron-builder.yml`. Krótko:

- Windows: ustaw `publisherName` (subject certyfikatu) i `verifyUpdateCodeSignature: true`; udostępnij certyfikat w CI (`CSC_LINK`/`CSC_KEY_PASSWORD`).
- macOS: `Developer ID Application` + notaryzacja (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `notarize: true`).
- Publikacja powinna być w osobnym, chronionym jobie CI (sekrety nie w zwykłych buildach).
