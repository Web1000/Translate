$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$expected = -join @([char]0x5B78, [char]0x7FD2, [char]0x4E2D, [char]0x6587)
$source = Get-Content -LiteralPath $env:HANZI_SELECTION_HELPER -Raw -Encoding UTF8
if ($env:HANZI_SELECTION_METHOD -eq 'clipboard') { $source = '& {' + $source + '} -UseClipboard' }
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($source))
$backup = New-Object System.Windows.Forms.DataObject
$oldClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
if ($oldClipboard) {
  foreach ($format in $oldClipboard.GetFormats($false)) {
    try { $backup.SetData($format, $false, $oldClipboard.GetData($format, $false)) } catch { }
  }
}
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Hanzi Lens selection test'
$form.Width = 480; $form.Height = 170; $form.TopMost = $true
$form.StartPosition = 'CenterScreen'
$box = New-Object System.Windows.Forms.TextBox
$box.Multiline = $true; $box.Dock = 'Fill'; $box.Text = $expected
$box.Font = New-Object System.Drawing.Font('Microsoft YaHei', 24)
$form.Controls.Add($box)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$script:child = $null; $script:output = ''; $script:failure = ''; $script:started = [DateTime]::UtcNow
$timer.add_Tick({
  if (-not $script:child) {
    $form.Activate(); [void]$box.Focus(); $box.SelectAll()
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = 'powershell.exe'
    $info.Arguments = '-NoProfile -NonInteractive -STA -EncodedCommand ' + $encoded
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.Encoding]::UTF8
    $script:child = New-Object System.Diagnostics.Process
    $script:child.StartInfo = $info
    [void]$script:child.Start()
    $script:started = [DateTime]::UtcNow
  } elseif ($script:child.HasExited) {
    $script:output = $script:child.StandardOutput.ReadToEnd()
    if ($script:child.ExitCode -ne 0) { $script:failure = 'Selection helper process failed.' }
    $form.Close()
  } elseif (([DateTime]::UtcNow - $script:started).TotalSeconds -gt 15) {
    $script:child.Kill(); $script:failure = 'Selection helper timed out.'; $form.Close()
  }
})
$form.add_Shown({ $form.Activate(); [void]$box.Focus(); $box.SelectAll(); $timer.Start() })
try { [System.Windows.Forms.Application]::Run($form) }
finally {
  $timer.Stop(); $timer.Dispose()
  if ($script:child) { if (-not $script:child.HasExited) { $script:child.Kill() }; $script:child.Dispose() }
  if ([System.Windows.Forms.Clipboard]::ContainsText() -and [System.Windows.Forms.Clipboard]::GetText() -eq $expected) {
    [System.Windows.Forms.Clipboard]::SetDataObject($backup, $true)
  }
  $form.Dispose()
}
if ($script:failure) { throw $script:failure }
$script:output
