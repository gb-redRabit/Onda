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