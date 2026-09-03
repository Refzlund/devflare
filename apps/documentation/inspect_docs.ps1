$files = Get-ChildItem -Path src\lib\docs\content\*.ts
$results = @()
foreach ($file in $files) {
    $content = Get-Content -Raw -Path $file.FullName
    # Find all navTitle matches
    $matches = [regex]::Matches($content, 'navTitle:\s*[''"](.+?)[''"]')
    for ($i = 0; $i -lt $matches.Count; $i++) {
        $title = $matches[$i].Groups[1].Value
        $startIndex = $matches[$i].Index
        $endIndex = if ($i + 1 -lt $matches.Count) { $matches[$i+1].Index } else { $content.Length }
        $pageContent = $content.Substring($startIndex, $endIndex - $startIndex)
        $hasSnippets = $pageContent -match "snippets:"
        $results += [PSCustomObject]@{
            Title = $title
            HasSnippets = $hasSnippets
            File = $file.Name
        }
    }
}
$results | Format-Table -AutoSize
$totalPages = $results.Count
$withSnippets = ($results | Where-Object { $_.HasSnippets }).Title
$withoutSnippets = ($results | Where-Object { !$_.HasSnippets }).Title
Write-Host "Total Pages: $totalPages"
Write-Host "With Snippets: $($withSnippets.Count)"
Write-Host "Without Snippets: $($withoutSnippets.Count)"
