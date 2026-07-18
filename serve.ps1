param([int]$Port = 8321)
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving $Root at http://localhost:$Port/"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.webmanifest' = 'application/manifest+json'
  '.json' = 'application/json'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.gz'   = 'application/gzip'
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
    if ($full.StartsWith($Root) -and (Test-Path $full -PathType Leaf)) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ct = $mime[$ext]
      if (-not $ct) { $ct = 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ctx.Response.ContentType = $ct
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $b = [System.Text.Encoding]::UTF8.GetBytes('404 not found')
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    }
  } catch {}
  finally { try { $ctx.Response.OutputStream.Close() } catch {} }
}
