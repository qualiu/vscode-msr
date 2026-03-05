# msr & nin Download Links

msr and nin are cross-platform CLI tools distributed together from the same repository.

- **Repository**: https://github.com/qualiu/msr
- **VSCode Extension** (auto-downloads both tools): [vscode-msr](https://marketplace.visualstudio.com/items?itemName=qualiu.vscode-msr)

## Download Base URL

All binaries are hosted at:

```
https://github.com/qualiu/msr/raw/master/tools/<filename>
```

Alternate mirrors (if GitHub is slow or blocked):

| Mirror      | Browse URL                                        | Download URL Format                                                        | Example                                                               |
| ----------- | ------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| SourceForge | https://sourceforge.net/projects/avasattva/files/ | `https://master.dl.sourceforge.net/project/avasattva/<filename>?viasf=1`   | https://master.dl.sourceforge.net/project/avasattva/msr.exe?viasf=1   |
| GitLab      | https://gitlab.com/lqm678/msr                     | `https://gitlab.com/lqm678/msr/-/raw/master/tools/<filename>?inline=false` | https://gitlab.com/lqm678/msr/-/raw/master/tools/msr.exe?inline=false |
| Gitee       | https://gitee.com/qualiu/msr                      | `https://gitee.com/qualiu/msr/raw/master/tools/<filename>`                 | https://gitee.com/qualiu/msr/raw/master/tools/msr.exe                 |

---

## Platform / Terminal Download Table

All binaries share the same compile hash `8a7398328ce9aa84600a7c8cb5b4c68534e95599` (compiled 2023-11-30), verified from embedded `COMPILE_*` metadata.

### msr

| Platform            | Terminal / Shell                         | Filename            | Minimum OS Version                                                                                          | Download URL                                                     |
| ------------------- | ---------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Windows x64 / ARM64 | CMD, PowerShell, Windows Terminal, MinGW | `msr.exe`           | x64: Windows XP/Server 2003+ (NT 5.1+/5.2+); ARM64: Windows 11 ARM64+                                      | https://github.com/qualiu/msr/raw/master/tools/msr.exe           |
| Windows x86_32      | CMD, PowerShell                          | `msr-Win32.exe`     | Windows XP+ (NT 5.1+)                                                                                       | https://github.com/qualiu/msr/raw/master/tools/msr-Win32.exe     |
| Windows (Cygwin)    | Cygwin bash                              | `msr.cygwin`        | Cygwin 2.8+ on Windows 10+                                                                  | https://github.com/qualiu/msr/raw/master/tools/msr.cygwin        |
| Linux x86_64        | bash, sh, zsh (Ubuntu/CentOS/Fedora/WSL) | `msr.gcc48`         | Linux kernel 2.6.32+, glibc 2.12+ (CentOS 6 / RHEL 6+)                                      | https://github.com/qualiu/msr/raw/master/tools/msr.gcc48         |
| Linux ARM64         | bash, sh, zsh                            | `msr-aarch64.linux` | Linux kernel 5.4+, glibc 2.27+ (Ubuntu 18.04+)                                              | https://github.com/qualiu/msr/raw/master/tools/msr-aarch64.linux |
| Linux x86_32        | bash, sh                                 | `msr-i386.gcc48`    | CentOS 5.4+ / RHEL 5.4+ (kernel 2.6.18+, glibc 2.5+)                                        | https://github.com/qualiu/msr/raw/master/tools/msr-i386.gcc48    |
| macOS ARM64         | bash, zsh (Apple Silicon)                | `msr-arm64.darwin`  | macOS 12 Monterey+ (Darwin 21.1.0+)                                                         | https://github.com/qualiu/msr/raw/master/tools/msr-arm64.darwin  |
| FreeBSD x86_64      | bash, sh                                 | `msr-amd64.freebsd` | FreeBSD 11.0+                                                                               | https://github.com/qualiu/msr/raw/master/tools/msr-amd64.freebsd |

### nin

| Platform            | Terminal / Shell                         | Filename            | Minimum OS Version                                                                                          | Download URL                                                     |
| ------------------- | ---------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Windows x64 / ARM64 | CMD, PowerShell, Windows Terminal, MinGW | `nin.exe`           | x64: Windows XP/Server 2003+ (NT 5.1+/5.2+); ARM64: Windows 11 ARM64+                                      | https://github.com/qualiu/msr/raw/master/tools/nin.exe           |
| Windows x86_32      | CMD, PowerShell                          | `nin-Win32.exe`     | Windows XP+ (NT 5.1+)                                                                                       | https://github.com/qualiu/msr/raw/master/tools/nin-Win32.exe     |
| Windows (Cygwin)    | Cygwin bash                              | `nin.cygwin`        | Cygwin 2.8+ on Windows 10+                                                                  | https://github.com/qualiu/msr/raw/master/tools/nin.cygwin        |
| Linux x86_64        | bash, sh, zsh (Ubuntu/CentOS/Fedora/WSL) | `nin.gcc48`         | Linux kernel 2.6.32+, glibc 2.12+ (CentOS 6 / RHEL 6+)                                      | https://github.com/qualiu/msr/raw/master/tools/nin.gcc48         |
| Linux ARM64         | bash, sh, zsh                            | `nin-aarch64.linux` | Linux kernel 5.4+, glibc 2.27+ (Ubuntu 18.04+)                                              | https://github.com/qualiu/msr/raw/master/tools/nin-aarch64.linux |
| Linux x86_32        | bash, sh                                 | `nin-i386.gcc48`    | CentOS 5.4+ / RHEL 5.4+ (kernel 2.6.18+, glibc 2.5+)                                        | https://github.com/qualiu/msr/raw/master/tools/nin-i386.gcc48    |
| macOS ARM64         | bash, zsh (Apple Silicon)                | `nin-arm64.darwin`  | macOS 12 Monterey+ (Darwin 21.1.0+)                                                         | https://github.com/qualiu/msr/raw/master/tools/nin-arm64.darwin  |
| FreeBSD x86_64      | bash, sh                                 | `nin-amd64.freebsd` | FreeBSD 11.0+                                                                               | https://github.com/qualiu/msr/raw/master/tools/nin-amd64.freebsd |

> **Notes on minimum OS versions:**
> - **Windows**: For Windows XP support, use architecture-matched binaries: `msr-Win32.exe` / `nin-Win32.exe` on x86 Windows XP, and `msr.exe` / `nin.exe` on x64 Windows XP/Server 2003. ARM64 support applies to Windows 11 ARM64.
> - **Linux x86_64 (.gcc48)**: Compiled on CentOS 7 (kernel 3.10, glibc 2.17, g++ 4.8.5). Minimum supported: CentOS 6+ / RHEL 6+ (kernel 2.6.32+, glibc 2.12+).
> - **Linux i386 (-i386.gcc48)**: Compiled on CentOS 6 (kernel 2.6.32, g++ 4.8.5). Confirmed to run on CentOS 5.4+ (kernel 2.6.18, glibc 2.5) — broadest Linux compatibility.
> - **Linux ARM64**: Compiled on Ubuntu 18.04 Azure (kernel 5.4, glibc 2.27). Requires glibc ≥ 2.27.
> - **macOS ARM64**: Compiled with Apple clang 15 on macOS 14 Sonoma (Darwin 23). Documented minimum is Darwin 21.1.0 (macOS 12 Monterey).
> - **FreeBSD**: Compiled on FreeBSD 12.3. Minimum supported: FreeBSD 11.0+.
> - **Cygwin**: Compiled on Cygwin 2.8.2 (CYGWIN_NT-10.0). Requires Cygwin 2.8+ running on Windows 10+.

---

## Quick Download Commands

### Windows — CMD (curl)

```bat
curl https://github.com/qualiu/msr/raw/master/tools/msr.exe -o msr.exe --silent
curl https://github.com/qualiu/msr/raw/master/tools/nin.exe -o nin.exe --silent
icacls msr.exe /grant %USERNAME%:RX
icacls nin.exe /grant %USERNAME%:RX
```

### Windows — PowerShell (Invoke-WebRequest fallback)

```powershell
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri 'https://github.com/qualiu/msr/raw/master/tools/msr.exe' -OutFile msr.exe
Invoke-WebRequest -Uri 'https://github.com/qualiu/msr/raw/master/tools/nin.exe' -OutFile nin.exe
```

### Linux x86_64 (bash/zsh)

```bash
curl --silent "https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.gcc48" -o ~/msr && chmod +x ~/msr
curl --silent "https://raw.githubusercontent.com/qualiu/msr/master/tools/nin.gcc48" -o ~/nin && chmod +x ~/nin
export PATH=$PATH:~
```

### Linux ARM64

```bash
curl --silent "https://raw.githubusercontent.com/qualiu/msr/master/tools/msr-aarch64.linux" -o ~/msr && chmod +x ~/msr
curl --silent "https://raw.githubusercontent.com/qualiu/msr/master/tools/nin-aarch64.linux" -o ~/nin && chmod +x ~/nin
export PATH=$PATH:~
```

### macOS ARM64 (Apple Silicon)

```bash
curl --silent "https://raw.githubusercontent.com/qualiu/msr/master/tools/msr-arm64.darwin" -o ~/msr && chmod +x ~/msr
curl --silent "https://raw.githubusercontent.com/qualiu/msr/master/tools/nin-arm64.darwin" -o ~/nin && chmod +x ~/nin
export PATH=$PATH:~
```

### Cygwin

```bash
curl --silent "https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.cygwin" -o ~/msr && chmod +x ~/msr
curl --silent "https://raw.githubusercontent.com/qualiu/msr/master/tools/nin.cygwin" -o ~/nin && chmod +x ~/nin
```

### FreeBSD x86_64

```bash
curl --silent "https://raw.githubusercontent.com/qualiu/msr/master/tools/msr-amd64.freebsd" -o ~/msr && chmod +x ~/msr
curl --silent "https://raw.githubusercontent.com/qualiu/msr/master/tools/nin-amd64.freebsd" -o ~/nin && chmod +x ~/nin
```

---

## Automated Download Scripts

For scripts that auto-detect the current platform and download the correct binary:

- **Linux / macOS / Cygwin / FreeBSD**: [`check-download-tools.sh`](https://github.com/qualiu/msr/blob/master/check-download-tools.sh)
  ```bash
  # Download to ~ (default)
  bash check-download-tools.sh

  # Download to /usr/bin/
  bash check-download-tools.sh /usr/bin/
  ```

- **Windows**: [`check-download.bat`](https://github.com/qualiu/msrTools/blob/master/check-download.bat) — tries curl → wget → PowerShell automatically
  ```bat
  check-download.bat %USERPROFILE%
  ```

---

## Integrity Verification

Verify downloaded binaries against known MD5 checksums in [`md5.txt`](https://github.com/qualiu/msr/blob/master/tools/md5.txt):

```bash
# Linux / macOS
md5sum msr* nin* | msr -t "\s+\**" -o " " -PAC | nin md5.txt -m
# Returns: count of verified files (should equal number of downloaded files)
```

Known MD5 values (from [`md5.txt`](https://github.com/qualiu/msr/blob/master/tools/md5.txt)):

| File                | MD5                                |
| ------------------- | ---------------------------------- |
| `msr.exe`           | `1fd9d21d5300a77e355d7e4a9a629294` |
| `msr-Win32.exe`     | `9bb9bd3051eeb70bd0056fca29dad812` |
| `msr.gcc48`         | `1fa4888f6b7d4aeb7329b7dec57e5f8a` |
| `msr-aarch64.linux` | `d51781a6f103f459ffe214fbc9b7a283` |
| `msr-i386.gcc48`    | `3938077e1a862933253d9c16c8323ad2` |
| `msr-arm64.darwin`  | `67083485732e75de0104334ab10de43b` |
| `msr-amd64.freebsd` | `3b50e26c1a2d95e285eaabbb184676f6` |
| `msr.cygwin`        | `3e52607db29763a022d43f208c95c0ef` |
| `nin.exe`           | `d8f208e1b3024babc3187429115aacb2` |
| `nin-Win32.exe`     | `d7e77fa86d7468b9ca59b595a8c2e961` |
| `nin.gcc48`         | `dae3575efa889086af9257c7e1af8c3e` |
| `nin-aarch64.linux` | `23e6bd8662337cb757ddec535f916fdd` |
| `nin-i386.gcc48`    | `273c0b087ec3796daaa5a0dc801236c4` |
| `nin-arm64.darwin`  | `755c8109f69b22bf6eacec708a6d77cf` |
| `nin-amd64.freebsd` | `1a07b6b53109b4f14409688896aa08ad` |
| `nin.cygwin`        | `7065d8961ab4b9fa5b421a1483f25b01` |

---

## Further Resources

**Related documentation in this project:**

- [msr User Guide](msr-user-guide.md) / [msr AI Agent Reference](msr-ai-agent-reference.md) — text search and replace
- [nin User Guide](nin-user-guide.md) / [nin AI Agent Reference](nin-ai-agent-reference.md) — set operations and distribution
- [vscode-msr User Guide](vscode-msr-user-guide.md) / [vscode-msr AI Agent Reference](vscode-msr-ai-agent-reference.md) — VS Code aliases
- [Use Cases and Comparisons](use-cases-and-comparisons.md) — practical use cases, industry applications, and tool comparisons
- [AI Agent Usage Guide](ai-agent-usage-guide.md) — AI agent integration guide for msr, nin, and vscode-msr aliases

**External links:**

- GitHub: https://github.com/qualiu/msr
- More tools: https://github.com/qualiu/msrTools
- VSCode extension: https://github.com/qualiu/vscode-msr