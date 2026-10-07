# Pushes the source (main) to GitHub and deploys the built game (dist/) to GitHub Pages (gh-pages branch root).
# Same approach as the SharkSOS (bukang-sea) deploy script, adapted for Windows PowerShell 5.1.
# The GitHub token comes from Git Credential Manager and is used in memory only: never printed or written to a file.
# usage: powershell -ExecutionPolicy Bypass -File deploy-pages.ps1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# Windows PowerShell 5.1 prefixes stdin of native commands with a BOM, which git credential rejects.
# The request (no secrets in it) goes through a temp file and cmd redirection instead; the answer stays in memory.
function Get-GitCredentialLines {
    $req = [IO.Path]::GetTempFileName()
    try {
        [IO.File]::WriteAllText($req, "protocol=https`nhost=github.com`n`n", (New-Object System.Text.UTF8Encoding $false))
        $out = & cmd.exe /d /c "git credential fill < `"$req`""
        if ($LASTEXITCODE -ne 0) { throw 'GitHub sign-in is required (Git Credential Manager).' }
        return $out
    } finally {
        Remove-Item -LiteralPath $req -Force -ErrorAction SilentlyContinue
    }
}
$projectDir = $PSScriptRoot
$owner = 'kongrae'
$repoName = 'water-sort-survival'
$repoUrl = "https://github.com/$owner/$repoName.git"
$apiUrl = "https://api.github.com/repos/$owner/$repoName"
$repoDescription = 'Water Sort Survival - endless water sort puzzle prototype'
$pagesDir = Join-Path $projectDir 'outputs/pages'
$siteUrl = "https://$owner.github.io/$repoName/"

function Run-Git {
    param([string[]]$GitArgs)
    # git prints progress on stderr; show it as plain text and judge success by the exit code only.
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & git @GitArgs 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $eap }
    if ($LASTEXITCODE -ne 0) { throw "git failed: $($GitArgs -join ' ')" }
}
function Get-Status {
    param($ErrorRecord)
    try { return [int]$ErrorRecord.Exception.Response.StatusCode } catch { return 0 }
}
function Send-Json {
    param([string]$Uri, [string]$Method, $Body)
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 5))
    return Invoke-RestMethod $Uri -Method $Method -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes
}

Push-Location $projectDir
try {
    $credential = @{}
    $credentialLines = Get-GitCredentialLines
    foreach ($line in $credentialLines) {
        $parts = $line -split '=', 2
        if ($parts.Length -eq 2) { $credential[$parts[0]] = $parts[1] }
    }
    if (-not $credential.password) { throw 'GitHub sign-in is required (Git Credential Manager).' }
    $headers = @{ Authorization = 'Bearer ' + $credential.password; 'X-GitHub-Api-Version' = '2022-11-28' }
    $account = Invoke-RestMethod https://api.github.com/user -Headers $headers
    if ($account.login -ne $owner) { throw "The signed-in GitHub account is not $owner." }

    try { $repo = Invoke-RestMethod $apiUrl -Headers $headers }
    catch {
        if ((Get-Status $_) -ne 404) { throw }
        $repo = Send-Json 'https://api.github.com/user/repos' 'Post' @{ name = $repoName; description = $repoDescription; private = $false }
    }
    if ($repo.description -ne $repoDescription) { $repo = Send-Json $apiUrl 'Patch' @{ description = $repoDescription } }

    # 'git remote get-url' writes to stderr when origin is missing, which Windows PowerShell turns into an error.
    if (@(git remote) -notcontains 'origin') { Run-Git -GitArgs @('remote', 'add', 'origin', $repoUrl) }
    elseif ((git remote get-url origin) -ne $repoUrl) { throw 'origin does not point to the deploy repository.' }

    & node build-pages.js dist
    if ($LASTEXITCODE -ne 0) { throw 'Pages build failed.' }
    Run-Git -GitArgs @('push', '-u', 'origin', 'main')

    if (-not (Test-Path (Join-Path $pagesDir '.git'))) {
        New-Item -ItemType Directory -Path $pagesDir -Force | Out-Null
        Run-Git -GitArgs @('-C', $pagesDir, 'init', '-b', 'gh-pages')
        Run-Git -GitArgs @('-C', $pagesDir, 'remote', 'add', 'origin', $repoUrl)
    }
    Run-Git -GitArgs @('-C', $pagesDir, 'config', 'user.name', $owner)
    Run-Git -GitArgs @('-C', $pagesDir, 'config', 'user.email', 'ghdfo918@gmail.com')
    Copy-Item (Join-Path $projectDir 'dist/*') -Destination $pagesDir -Recurse -Force
    New-Item -ItemType File -Path (Join-Path $pagesDir '.nojekyll') -Force | Out-Null
    $sourceCommit = git rev-parse HEAD
    Set-Content -LiteralPath (Join-Path $pagesDir 'version.json') -Value (@{ sourceCommit = $sourceCommit; builtAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json) -Encoding utf8
    Run-Git -GitArgs @('-C', $pagesDir, 'add', '-A')
    & git -C $pagesDir diff --cached --quiet
    if ($LASTEXITCODE -eq 1) { Run-Git -GitArgs @('-C', $pagesDir, 'commit', '-m', "web deploy: $sourceCommit") }
    elseif ($LASTEXITCODE -ne 0) { throw 'Could not check the deploy changes.' }
    Run-Git -GitArgs @('-C', $pagesDir, 'push', '-u', 'origin', 'gh-pages')

    $pagesBody = @{ build_type = 'legacy'; source = @{ branch = 'gh-pages'; path = '/' } }
    try {
        $pages = Invoke-RestMethod "$apiUrl/pages" -Headers $headers
    } catch {
        if ((Get-Status $_) -ne 404) { throw }
        try {
            $pages = Send-Json "$apiUrl/pages" 'Post' $pagesBody
        } catch {
            # GitHub may enable the site by itself on the first gh-pages push.
            if ((Get-Status $_) -ne 409) { throw }
            $pages = Invoke-RestMethod "$apiUrl/pages" -Headers $headers
        }
    }
    if ($pages.build_type -ne 'legacy' -or $pages.source.branch -ne 'gh-pages' -or $pages.source.path -ne '/') {
        Send-Json "$apiUrl/pages" 'Put' $pagesBody | Out-Null
    }
    Write-Output $siteUrl
} finally {
    if ($credential) { $credential.Clear() }
    if ($headers) { $headers.Clear() }
    $credentialLines = $null
    Pop-Location
}
