param([Parameter(Mandatory = $true)][long]$WindowHandle)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PetWindowOrder {
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after,
        int x, int y, int width, int height, uint flags);
}
'@
# HWND_BOTTOM; preserve bounds and the user's focused application.
if (-not [PetWindowOrder]::SetWindowPos([IntPtr]$WindowHandle, [IntPtr]1, 0, 0, 0, 0, 0x0013)) {
    throw "SetWindowPos failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}
