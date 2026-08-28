Get-ChildItem -Path "manifest.json", "package.json", ".\*.js", ".\*.html", ".\src\*.js" -File -ErrorAction SilentlyContinue |
    ForEach-Object {
        "--- File: $($_.FullName) ---"
        Get-Content -LiteralPath $_.FullName -Raw
    } |
    Set-Content -Path KITTENTTSWEBGPUEXT.txt -Encoding utf8

