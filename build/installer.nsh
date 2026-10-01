; Onda - custom NSIS installer page (plan section 10.1d).
;
; Replaces the default MUI2 finish page with one that offers:
;   * "Run Onda now"            - launches the app (respects --updated)
;   * "Create a desktop shortcut" - opt-out; deletes the .lnk when unchecked
;
; The installer stays per-user assisted (unsigned build => no UAC elevation,
; see section 10.5 of the plan for why per-machine is not offered yet).
;
; Note: this file is !include'd before MUI2.nsh / language files are loaded,
; so only NSIS-native macros are allowed at top level here. Language strings
; use numeric LANG ids (1033 = en_US, 1045 = pl_PL).

LangString FinishRunText 1033 "Run Onda now"
LangString FinishDesktopText 1033 "Create a desktop shortcut"
LangString FinishRunText 1045 "Uruchom Onda teraz"
LangString FinishDesktopText 1045 "Utwórz skrót na pulpicie"
LangString FinishTitleText 1033 "Completing the Onda Setup Wizard"
LangString FinishBodyText 1033 "Onda was installed successfully."
LangString FinishTitleText 1045 "Zakończenie instalacji Onda"
LangString FinishBodyText 1045 "Onda została zainstalowana pomyślnie."

; Uninstaller options page: let the user decide whether to also remove personal
; data (%APPDATA%\Onda = settings, library, downloads). Default is "keep".
LangString UnDataTitleText 1033 "Personal data"
LangString UnDataBodyText 1033 "Onda can also remove your settings, media library and downloads. This cannot be undone."
LangString UnDataCheckText 1033 "Also delete my Onda settings, library and downloads"
LangString UnDataTitleText 1045 "Dane osobowe"
LangString UnDataBodyText 1045 "Onda może także usunąć Twoje ustawienia, bibliotekę multimediów i pobrane pliki. Tej operacji nie można cofnąć."
LangString UnDataCheckText 1045 "Usuń również moje ustawienia, bibliotekę i pobrane pliki Onda"

!ifndef BUILD_UNINSTALLER
  Var FinishRunCheck
  Var FinishDesktopCheck
!endif

!macro customFinishPage

  Function FinishPageLaunchApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function FinishPageShow
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 120u 64u 60% 24u "$(FinishTitleText)"
    Pop $0
    ${NSD_CreateLabel} 120u 88u 60% 28u "$(FinishBodyText)"
    Pop $0

    ${NSD_CreateCheckbox} 120u 128u 60% 12u "$(FinishRunText)"
    Pop $FinishRunCheck
    ${NSD_Check} $FinishRunCheck

    ${NSD_CreateCheckbox} 120u 146u 60% 12u "$(FinishDesktopText)"
    Pop $FinishDesktopCheck
    ${NSD_Check} $FinishDesktopCheck

    nsDialogs::Show
  FunctionEnd

  Function FinishPageLeave
    ${NSD_GetState} $FinishRunCheck $0
    ${If} $0 == ${BST_CHECKED}
      Call FinishPageLaunchApp
    ${EndIf}

    ${NSD_GetState} $FinishDesktopCheck $0
    ${If} $0 <> ${BST_CHECKED}
      Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ${EndIf}
  FunctionEnd

  Page custom FinishPageShow FinishPageLeave

!macroend

; ---------------------------------------------------------------------------
; Uninstaller customisations
; ---------------------------------------------------------------------------

; Onda manages its own autostart through Electron's setLoginItemSettings
; (HKCU\...\Run), so the installer must NOT touch it. On uninstall we still
; remove any leftover entry so Windows does not try to launch a deleted exe.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Onda"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "onda"
!macroend

; Optional uninstaller page: offer to remove user data. The main uninstall
; section intentionally keeps %APPDATA% (no DELETE_APP_DATA_ON_UNINSTALL define),
; so this page owns the decision and runs after the files are removed.
!macro customUninstallPage
  Var UnDeleteDataCheck

  Function un.UninstallOptionsShow
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "$(UnDataTitleText)"
    Pop $0
    ${NSD_CreateLabel} 0 26u 100% 30u "$(UnDataBodyText)"
    Pop $0
    ${NSD_CreateCheckbox} 0 60u 100% 12u "$(UnDataCheckText)"
    Pop $UnDeleteDataCheck

    nsDialogs::Show
  FunctionEnd

  Function un.UninstallOptionsLeave
    ${NSD_GetState} $UnDeleteDataCheck $0
    ${If} $0 == ${BST_CHECKED}
      ; electron always stores per-user data under $APPDATA; mirror the names
      ; the bundled uninstaller uses (product + package fallbacks).
      RMDir /r "$APPDATA\${APP_FILENAME}"
      !ifdef APP_PRODUCT_FILENAME
        RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
      !endif
      !ifdef APP_PACKAGE_NAME
        RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
      !endif
    ${EndIf}
  FunctionEnd

  UninstPage custom un.UninstallOptionsShow un.UninstallOptionsLeave
!macroend