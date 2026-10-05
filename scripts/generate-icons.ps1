# Reproduce public/icons/finance.svg with supersampled native GDI+; no dependencies.
# The three bars stay within the central 80% maskable safe circle.
Add-Type -AssemblyName System.Drawing
$iconDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/icons'))
foreach ($icon in @(@{Name='icon-192.png'; Size=192}, @{Name='icon-512.png'; Size=512}, @{Name='maskable-512.png'; Size=512}, @{Name='apple-touch-icon.png'; Size=180})) {
  $large = New-Object System.Drawing.Bitmap ($icon.Size * 4), ($icon.Size * 4)
  $graphics = [System.Drawing.Graphics]::FromImage($large)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#285547'))
  $scale = ($icon.Size * 4) / 512
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([single](22.1 * $scale))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  foreach ($bar in @(@{X=152; Top=224}, @{X=256; Top=159}, @{X=360; Top=263})) {
    $graphics.DrawLine($pen, [single]($bar.X * $scale), [single](354 * $scale), [single]($bar.X * $scale), [single]($bar.Top * $scale))
  }
  $output = New-Object System.Drawing.Bitmap $icon.Size, $icon.Size
  $resizer = [System.Drawing.Graphics]::FromImage($output)
  # Bicubic edge samples can have alpha; composite onto an opaque brand background.
  $resizer.Clear([System.Drawing.ColorTranslator]::FromHtml('#285547'))
  $resizer.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $resizer.DrawImage($large, 0, 0, $icon.Size, $icon.Size)
  $output.Save((Join-Path $iconDirectory $icon.Name), [System.Drawing.Imaging.ImageFormat]::Png)
  $resizer.Dispose(); $output.Dispose(); $pen.Dispose(); $graphics.Dispose(); $large.Dispose()
}
