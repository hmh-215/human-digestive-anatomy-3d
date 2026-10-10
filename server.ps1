[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "3D Human Digestive Anatomy - Web Server"

$basePort = 8085
$port = $basePort
$maxPort = 8090
$listener = $null

Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "     3D HUMAN DIGESTIVE SYSTEM ANATOMY WEB SUITE           " -ForegroundColor Yellow
Write-Host "     GIAI PHAU & BOC TACH TANG LOP DHYHN                   " -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "Working Directory: $PSScriptRoot" -ForegroundColor Gray

while ($port -le $maxPort) {
    try {
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://localhost:$port/")
        $listener.Start()
        Write-Host "[+] Khoi tao Web Server thanh cong tren cong: $port" -ForegroundColor Green
        break
    } catch {
        Write-Host "[-] Port $port da bi chiem dung, dang thu port $($port + 1)..." -ForegroundColor Yellow
        if ($listener) { $listener.Close() }
        $port++
    }
}

if (-not $listener.IsListening) {
    Write-Host "[!] Khong the khoi tao HttpListener tren bat ky cong nao tu $basePort den $maxPort!" -ForegroundColor Red
    pause
    exit 1
}

$url = "http://localhost:$port/"
Write-Host "[+] Web App URL: $url" -ForegroundColor Cyan
Write-Host "[+] Dang mo trinh duyet tu dong..." -ForegroundColor Yellow
Start-Process $url

Write-Host "[*] May chu dang chay. Nhan Ctrl + C de dung may chu." -ForegroundColor White
Write-Host "-----------------------------------------------------------" -ForegroundColor Gray

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".glb"  = "model/gltf-binary"
    ".gltf" = "model/gltf+json"
    ".fbx"  = "application/octet-stream"
    ".bin"  = "application/octet-stream"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawUrl = $request.RawUrl.Split('?')[0]
        $localPath = $rawUrl.TrimStart('/')
        if ([string]::IsNullOrEmpty($localPath)) {
            $localPath = "index.html"
        }
        $localPath = [System.Uri]::UnescapeDataString($localPath).Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $filePath = [System.IO.Path]::Combine($PSScriptRoot, $localPath)

        if ([System.IO.File]::Exists($filePath)) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            
            $response.ContentType = $mime
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")

            try {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.StatusCode = 200
            } catch {
                $response.StatusCode = 500
            }
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rawUrl")
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }
        $response.OutputStream.Close()
    }
} finally {
    if ($listener) {
        $listener.Stop()
        $listener.Close()
    }
}
