param([ValidateSet('setup','train','start')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv-rasa/Scripts/python.exe'
if ($Action -eq 'setup') {
  $driveName = [System.IO.Path]::GetPathRoot($projectRoot).TrimEnd('\').TrimEnd(':')
  if ((Get-PSDrive -Name $driveName).Free -lt 4GB) { throw 'Rasa setup needs at least 4 GB of free disk space.' }
  & uv venv --python 3.10 (Join-Path $projectRoot '.venv-rasa')
  if ($LASTEXITCODE -ne 0) { throw 'Python environment setup failed' }
  & uv pip install --python $pythonPath rasa==3.6.21
  if ($LASTEXITCODE -ne 0) { throw 'Rasa installation failed' }
  exit
}
if (!(Test-Path -LiteralPath $pythonPath)) { throw 'Run npm run nlu:setup first' }
if ($Action -eq 'train') {
  & node (Join-Path $projectRoot 'scripts/train-reviewed-nlu.js')
  if ($LASTEXITCODE -ne 0) { throw 'Reviewed learning loop failed; active model preserved' }
  exit
}
Push-Location (Join-Path $projectRoot 'nlu')
try {
  $env:SQLALCHEMY_SILENCE_UBER_WARNING = '1'
  $env:RASA_TELEMETRY_ENABLED = 'false'
  $env:PYTHONIOENCODING = 'utf-8'
  $env:TF_NUM_INTRAOP_THREADS = '1'
  $env:TF_NUM_INTEROP_THREADS = '1'
  $env:OMP_NUM_THREADS = '1'
  # TensorFlow 2.12 cannot reliably save checkpoints under Korean Windows TEMP paths.
  $nluTemp = Join-Path $env:PUBLIC 'usagi-nlu-temp'
  New-Item -ItemType Directory -Path $nluTemp -Force | Out-Null
  $env:TEMP = $nluTemp
  $env:TMP = $nluTemp
  & $pythonPath run_rasa.py run --enable-api --interface 127.0.0.1 --port 5077 --model models/usagi.tar.gz
  if ($LASTEXITCODE -ne 0) { throw "Rasa $Action failed" }
} finally { Pop-Location }
