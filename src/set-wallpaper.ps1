param([Parameter(Mandatory = $true)][string]$WallpaperPath)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $WallpaperPath)) { throw 'Wallpaper file does not exist' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BgappWallpaper {
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SystemParametersInfo(uint action, uint parameter, string value, uint flags);
}
'@
if (-not [BgappWallpaper]::SystemParametersInfo(0x0014, 0, $WallpaperPath, 3)) {
    throw "Wallpaper update failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}
