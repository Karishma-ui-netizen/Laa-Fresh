# Light-weight local web server for Laa Fresh Stock Manager
$port = 8080
$prefix = "http://localhost:$port/"
$root = $PSScriptRoot

if (-not $root) {
    $root = "C:\Users\Karishmasharif\Downloads\Laa fresh"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Output "HTTP server listening at $prefix"
} catch {
    Write-Error "Failed to start listener: $_"
    exit 1
}

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".ico"  = "image/x-icon"
    ".json" = "application/json; charset=utf-8"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = [System.Uri]::UnescapeDataString($request.Url.LocalPath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($urlPath)) {
            $urlPath = "index.html"
        }

        $fullPath = [System.IO.Path]::Combine($root, $urlPath.Replace('/', '\'))

        # Security check: ensure path is within $root
        $normalizedRoot = [System.IO.Path]::GetFullPath($root).TrimEnd('\')
        $normalizedPath = [System.IO.Path]::GetFullPath($fullPath)

        if ($normalizedPath.StartsWith($normalizedRoot, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.File]::Exists($normalizedPath)) {
            $ext = [System.IO.Path]::GetExtension($normalizedPath).ToLower()
            $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
            $response.ContentType = $contentType
            $bytes = [System.IO.File]::ReadAllBytes($normalizedPath)
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $err = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $err.Length
            $response.OutputStream.Write($err, 0, $err.Length)
        }

        $response.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
