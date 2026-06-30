; installer.nsh — Custom NSIS installer script for Your Career Buddy
; Publisher: Bosket's Tech Ventures

!macro customHeader
  !system "echo Building Your Career Buddy installer..."
!macroend

!macro customInit
  ; Check for existing installation and offer upgrade
  ReadRegStr $R0 HKCU "Software\Boskets Tech Ventures\Your Career Buddy" "InstallPath"
  ${If} $R0 != ""
    MessageBox MB_YESNO "An existing version of Your Career Buddy was found.$\n$\nWould you like to upgrade it?" IDYES upgrade IDNO abort
    upgrade:
      Goto done
    abort:
      Abort
    done:
  ${EndIf}
!macroend

!macro customInstall
  ; Create user data directory
  CreateDirectory "$APPDATA\your-career-buddy"

  ; Write registry info for publisher
  WriteRegStr HKCU "Software\Boskets Tech Ventures\Your Career Buddy" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\Boskets Tech Ventures\Your Career Buddy" "Version"     "1.0.0"
  WriteRegStr HKCU "Software\Boskets Tech Ventures\Your Career Buddy" "Publisher"   "Bosket's Tech Ventures"

  ; Write Add/Remove Programs info
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourCareerBuddy" "DisplayName"     "Your Career Buddy"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourCareerBuddy" "DisplayVersion"  "1.0.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourCareerBuddy" "Publisher"       "Bosket's Tech Ventures"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourCareerBuddy" "URLInfoAbout"    "https://bosketstechventures.com"

  ; Show completion message
  MessageBox MB_OK "Your Career Buddy v1.0.0 has been installed successfully!$\n$\nPublisher: Bosket's Tech Ventures$\n$\nClick OK to finish. The app will launch automatically."
!macroend

!macro customUnInstall
  ; Clean up registry
  DeleteRegKey HKCU "Software\Boskets Tech Ventures\Your Career Buddy"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourCareerBuddy"
  MessageBox MB_OK "Your Career Buddy has been uninstalled.$\n$\nThank you for using Bosket's Tech Ventures software."
!macroend
