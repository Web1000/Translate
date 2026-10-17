param([switch]$UseClipboard)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$answer = @{ text = ''; usedClipboard = $false; error = $null }
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HanziSelection {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion data; }
  [StructLayout(LayoutKind.Explicit)] struct InputUnion {
    [FieldOffset(0)] public KEYBDINPUT keyboard;
    [FieldOffset(0)] public MOUSEINPUT mouse;
  }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT {
    public ushort key, scan; public uint flags, time; public UIntPtr extra;
  }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT {
    public int x, y; public uint data, flags, time; public UIntPtr extra;
  }
  public static bool Copy() {
    INPUT[] inputs = new INPUT[4];
    for (int i=0; i<4; i++) inputs[i].type = 1;
    inputs[0].data.keyboard.key = 0x11;
    inputs[1].data.keyboard.key = 0x43;
    inputs[2].data.keyboard.key = 0x43; inputs[2].data.keyboard.flags = 2;
    inputs[3].data.keyboard.key = 0x11; inputs[3].data.keyboard.flags = 2;
    return SendInput(4, inputs, Marshal.SizeOf(typeof(INPUT))) == 4;
  }
}
'@
  $target = [HanziSelection]::GetForegroundWindow()
  $deadline = [DateTime]::UtcNow.AddSeconds(3)
  while (([HanziSelection]::GetAsyncKeyState(0x10) -band 0x8000) -or
         ([HanziSelection]::GetAsyncKeyState(0x11) -band 0x8000) -or
         ([HanziSelection]::GetAsyncKeyState(0x12) -band 0x8000) -or
         ([HanziSelection]::GetAsyncKeyState(0x5B) -band 0x8000) -or
         ([HanziSelection]::GetAsyncKeyState(0x5C) -band 0x8000)) {
    if ([DateTime]::UtcNow -gt $deadline) { throw 'Release the shortcut keys, then try again.' }
    Start-Sleep -Milliseconds 20
  }
  # Use the selected ranges exposed by Windows accessibility before copying.
  try {
    $element = [System.Windows.Automation.AutomationElement]::FocusedElement
    if (-not $UseClipboard -and $element -and -not $element.Current.IsPassword) {
      $pattern = $element.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
      if ($pattern) {
        $parts = @($pattern.GetSelection() | ForEach-Object { $_.GetText(10000) })
        $answer.text = $parts -join "`n"
      }
    }
  } catch { }
  if ([string]::IsNullOrWhiteSpace($answer.text)) {
    if ([HanziSelection]::GetForegroundWindow() -ne $target) { throw 'The active app changed. Select the text again and retry the shortcut.' }
    $sequence = [HanziSelection]::GetClipboardSequenceNumber()
    if (-not [HanziSelection]::Copy()) { throw 'Windows blocked copying from this app. Try screen capture instead.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(2)
    while ([DateTime]::UtcNow -lt $deadline) {
      Start-Sleep -Milliseconds 40
      if ([HanziSelection]::GetClipboardSequenceNumber() -ne $sequence) {
        try {
          if ([System.Windows.Forms.Clipboard]::ContainsText()) {
            $answer.text = [System.Windows.Forms.Clipboard]::GetText()
            $answer.usedClipboard = $true
            break
          }
        } catch { }
      }
    }
  }
} catch { $answer.error = $_.Exception.Message }
$answer | ConvertTo-Json -Compress
