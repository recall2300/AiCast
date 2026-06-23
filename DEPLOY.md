# AiCast 배포 가이드 (미니 PC + WSL2 + ngrok)

> 미니 PC(Windows)를 서버로 사용해 인터넷에 공개하는 전체 절차입니다.  
> WSL2(Ubuntu) 위에서 systemd 서비스로 실행하므로 RDP 없이 SSH로만 관리합니다.

---

## 전체 흐름

```
개발 PC  →  GitHub  →  미니 PC WSL2(Ubuntu)  →  ngrok  →  인터넷
                              ↑
                    SSH로 원격 관리 (포트 2222)
```

---

## Part A — 개발 PC에서 GitHub에 올리기

### 1. GitHub 레포 생성
[github.com](https://github.com) → New repository → Private 권장 → Create

### 2. 푸시
```powershell
cd C:\Code\AiCast
git remote add origin https://github.com/본인계정/AiCast.git
git push -u origin main
```

> `.env.local`은 `.gitignore`에 포함되어 있어 자동으로 제외됩니다.

---

## Part B — 미니 PC 초기 설정 (최초 1회)

### 1. Windows 계정 설정

**중요:** Task Scheduler로 WSL 자동 시작을 하려면 **로컬 계정**이 필요합니다.  
Microsoft 계정을 사용 중이라면: `설정 → 계정 → 사용자 정보 → 로컬 계정으로 로그인`

### 2. WSL2 + Ubuntu 설치
PowerShell (관리자):
```powershell
wsl --install
```
설치 후 **재부팅** → Ubuntu 창에서 username/password 설정.

### 3. WSL2 설정

**mirrored 네트워킹** (WSL2 IP = Windows IP, SSH 포트포워딩 불필요):

`%USERPROFILE%\.wslconfig` 파일 생성:
```powershell
notepad "$env:USERPROFILE\.wslconfig"
```
```ini
[wsl2]
networkingMode=mirrored
```

**systemd 활성화** (WSL Ubuntu 안에서):
```bash
sudo nano /etc/wsl.conf
```
```ini
[boot]
systemd=true
```

WSL 재시작:
```powershell
wsl --shutdown
wsl
```

### 4. Ubuntu 안에서 소프트웨어 설치

**Node.js:**
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Python + Supertonic:**
```bash
sudo apt-get install -y pipx
pipx install "supertonic[serve]"
pipx ensurepath
source ~/.bashrc
```

**ngrok:**
```bash
sudo snap install ngrok
ngrok config add-authtoken 여기에ngrok토큰입력
```
ngrok 토큰: [ngrok.com](https://ngrok.com) → 대시보드 → **Your Authtoken**

### 5. WSL SSH 서버 설정

```bash
sudo apt-get install -y openssh-server
sudo nano /etc/ssh/sshd_config
```

`#Port 22` → `Port 2222` 로 변경 후:

```bash
sudo systemctl enable ssh
sudo systemctl start ssh
```

Windows 방화벽 열기 (PowerShell 관리자):
```powershell
New-NetFirewallRule -DisplayName "WSL SSH" -Direction Inbound -Protocol TCP -LocalPort 2222 -Action Allow
```

### 6. Windows SSH 서버 설치 (복구용)

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
New-NetFirewallRule -DisplayName "Windows SSH" -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow
```

> WSL이 꺼진 상태에서도 Windows SSH(포트 22)로 접속 후 `wsl` 명령으로 복구 가능합니다.

### 7. 레포 클론 + 빌드 (WSL Ubuntu 안에서)

```bash
cd ~
git clone https://github.com/본인계정/AiCast.git AiCast
cd AiCast
npm install
npm run build
```

### 8. .env.local 생성

```bash
# ACCESS_TOKEN 랜덤값 생성
cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 40

nano ~/AiCast/.env.local
```

```
ANTHROPIC_API_KEY=sk-ant-api03-실제키입력
SUPERTONIC_TTS_URL=http://localhost:7788
ACCESS_PASSWORD=원하는비밀번호
ACCESS_TOKEN=위에서생성한랜덤값
DAILY_GENERATION_LIMIT=10
```

---

## Part C — ngrok 고정 도메인 발급 (최초 1회)

1. [ngrok.com](https://ngrok.com) → Sign up (무료)
2. 대시보드 → **"Domains"** → **"New Domain"**
3. 발급된 도메인 메모 (예: `your-name.ngrok-free.dev`)

---

## Part D — systemd 서비스 등록 (최초 1회)

WSL Ubuntu 안에서:

**① Supertonic:**
```bash
sudo nano /etc/systemd/system/supertonic.service
```
```ini
[Unit]
Description=Supertonic TTS Server
After=network.target

[Service]
Type=simple
User=여기에WSL유저명
ExecStart=/home/여기에WSL유저명/.local/bin/supertonic serve
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**② AiCast:**
```bash
sudo nano /etc/systemd/system/aicast.service
```
```ini
[Unit]
Description=AiCast Next.js App
After=network.target supertonic.service

[Service]
Type=simple
User=여기에WSL유저명
WorkingDirectory=/home/여기에WSL유저명/AiCast
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**③ ngrok:**
```bash
sudo nano /etc/systemd/system/ngrok.service
```
```ini
[Unit]
Description=ngrok Tunnel
After=network.target aicast.service

[Service]
Type=simple
User=여기에WSL유저명
ExecStart=/snap/bin/ngrok http --domain=your-name.ngrok-free.dev 3000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**활성화:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable supertonic aicast ngrok
sudo systemctl start supertonic aicast ngrok
```

**상태 확인:**
```bash
sudo systemctl status supertonic aicast ngrok
```

---

## Part E — 부팅 시 WSL 자동 시작 (최초 1회)

WSL이 부팅 시 자동으로 켜지도록 Windows Task Scheduler에 등록합니다.

**자동 로그인 설정** (PowerShell 관리자):
```powershell
$RegPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
Set-ItemProperty -Path $RegPath -Name "AutoAdminLogon" -Value "1"
Set-ItemProperty -Path $RegPath -Name "DefaultUserName" -Value "윈도우유저명"
Set-ItemProperty -Path $RegPath -Name "DefaultPassword" -Value "윈도우비밀번호"
```

**Task Scheduler 등록:**
```powershell
$cred = Get-Credential -UserName "컴퓨터이름\윈도우유저명" -Message "Windows 비밀번호 입력"
$action = New-ScheduledTaskAction -Execute "wsl.exe" -Argument "-d Ubuntu -- /bin/bash -c 'sleep infinity'"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0
Register-ScheduledTask -TaskName "WSL2 Autostart" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -User $cred.UserName -Password $cred.GetNetworkCredential().Password
```

> `컴퓨터이름\윈도우유저명` 확인: PowerShell에서 `whoami`

---

## Part F — 원격 관리 (SSH)

개발 PC VSCode에서 `~/.ssh/config`:
```
Host minipc
  HostName 미니PC-IP주소
  User WSL유저명
  Port 2222
```

접속: VSCode → Remote Explorer → minipc → Linux 선택

미니 PC IP 확인: PowerShell에서 `ipconfig`

---

## Part G — 코드 업데이트 루틴

**개발 PC에서:**
```powershell
git add .
git commit -m "변경 내용"
git push
```

**미니 PC SSH에서:**
```bash
cd ~/AiCast
git pull
npm install       # package.json이 바뀐 경우만
npm run build
sudo systemctl restart aicast
```

---

## 접근 제어 설정 요약

| 환경변수 | 설명 | 예시 |
|---|---|---|
| `ACCESS_PASSWORD` | 사용자 입력 비밀번호 | `mypassword123` |
| `ACCESS_TOKEN` | 세션 쿠키 값 (랜덤 생성) | `k7Qm2nXpR9vL...` |
| `DAILY_GENERATION_LIMIT` | IP당 하루 생성 횟수 제한 | `10` |

> 세 값 모두 `.env.local`에만 존재하며 GitHub에 올라가지 않습니다.  
> `ACCESS_PASSWORD` 미설정 시 인증이 비활성화됩니다 (로컬 개발용).

---

## 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| SSH 2222 안됨 | WSL이 꺼짐 | Windows SSH(22)로 접속 후 `wsl` 실행 |
| ngrok URL 접속 불가 | ngrok 서비스 중단 | `sudo systemctl restart ngrok` |
| TTS 오류 | Supertonic 중단 | `sudo systemctl restart supertonic` |
| 재부팅 후 안됨 | Task Scheduler 미실행 | RDP 접속 후 `wsl` 수동 실행 |
