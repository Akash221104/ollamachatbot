# Check if Java is installed
try {
    $javaVersion = java -version 2>&1
    Write-Host "Detected Java:" -ForegroundColor Green
    Write-Host $javaVersion
} catch {
    Write-Error "Java 17+ is required but java command was not found. Please install Java 17+ first."
    exit 1
}

# Local Maven configuration
$mavenDir = Join-Path $PSScriptRoot "maven"
$zipPath = Join-Path $PSScriptRoot "maven.zip"
$mavenBinPath = Join-Path $mavenDir "apache-maven-3.9.16\bin\mvn.cmd"

# Download and extract Maven if not present
if (-not (Test-Path $mavenBinPath)) {
    Write-Host "Maven not found locally. Downloading Apache Maven 3.9.16..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $mavenDir | Out-Null
    
    $url = "https://dlcdn.apache.org/maven/maven-3/3.9.16/binaries/apache-maven-3.9.16-bin.zip"
    Invoke-WebRequest -Uri $url -OutFile $zipPath
    
    Write-Host "Extracting Maven..." -ForegroundColor Cyan
    Expand-Archive -Path $zipPath -DestinationPath $mavenDir -Force
    Remove-Item -Path $zipPath -Force
    Write-Host "Maven installed successfully at: $mavenDir" -ForegroundColor Green
}

# Run the Spring Boot application using local Maven
Write-Host "Starting Spring Boot Chatbot Proxy Application..." -ForegroundColor Cyan
& $mavenBinPath spring-boot:run
