Get-ChildItem -Path ".\*.json", ".\*.js", ".\*.html", ".\src\*.js" -File -ErrorAction SilentlyContinue |
    ForEach-Object {
        "--- File: $($_.FullName) ---"
        Get-Content -LiteralPath $_.FullName -Raw
    } |
    Set-Content -Path combined_code.txt -Encoding utf8

