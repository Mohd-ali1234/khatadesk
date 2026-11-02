; Inno Setup script: wraps the PyInstaller folder into KhataDesk-Setup-x.y.z.exe
#define AppName "KhataDesk"
#define AppVersion "1.0.0"

[Setup]
AppId={{B6E1D7C4-5B0A-4C1F-9D0E-3A8F2C7A4E11}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=KhataDesk
; Per-user install: no administrator password needed.
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\KhataDesk
DefaultGroupName=KhataDesk
DisableProgramGroupPage=yes
OutputDir=..\release
OutputBaseFilename=KhataDesk-Setup-{#AppVersion}
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\KhataDesk.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "..\backend\dist\KhataDesk\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\KhataDesk"; Filename: "{app}\KhataDesk.exe"
Name: "{autodesktop}\KhataDesk"; Filename: "{app}\KhataDesk.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\KhataDesk.exe"; Description: "Start KhataDesk now"; Flags: nowait postinstall skipifsilent

; Uninstalling removes the program only. The ledgers in %APPDATA%\KhataDesk are left alone on purpose.
