# Manually Download Tools and Put into PATH
You can also manually **download** the tiny [msr.EXE](https://github.com/qualiu/msr#liberate--digitize-daily-works-by-2-exe-file-processing-data-mining-map-reduce) (of your system type) , then **add** the folder to `%PATH%` or `$PATH`.

- **Use** an existing folder or **create** a new folder like `~/tools` or `D:\tools` instead of **`system folder`**, then add it to `$PATH` or `%PATH%`.

- Or simply **copy 1 command** below to download + copy to **`system folder`** which already in `$PATH` or `%PATH%`:

  - **Windows**
    - `x86_64` / `Arm64` 64-bit `Windows` + `MinGW`

      - **If has `curl.exe` or `wget.exe`**: (check by command like `"where curl.exe"`, you can get it by [choco](https://chocolatey.org/packages/Wget) or [cygwin](https://github.com/qualiu/msrTools/blob/master/system/install-cygwin.bat))

        - **curl** <https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.exe> -o `msr.tmp` && `move /y msr.tmp msr.exe` && `icacls msr.exe /grant %USERNAME%:RX` && **move** [msr.exe](https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.exe) `%SystemRoot%\`
        - **wget** <https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.exe> -O `msr.tmp` && `move /y msr.tmp msr.exe` && `icacls msr.exe /grant %USERNAME%:RX` && **move** [msr.exe](https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.exe) `%SystemRoot%\`

      - Otherwise use `PowerShell`:

        **PowerShell** `-Command "$ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.exe' -OutFile msr.tmp"` && `move /y msr.tmp msr.exe` && `icacls msr.exe /grant %USERNAME%:RX` && **move** [msr.exe](https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.exe) `%SystemRoot%\`

    - **Cygwin** [bash terminal](#supported-4-terminal-types-on-windows) on Windows

      **curl** <https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.cygwin> -o `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `mv msr /usr/bin/msr`

    - `x86` 32-bit `Windows` + `MinGW`

      **curl** <https://raw.githubusercontent.com/qualiu/msr/master/tools/msr-Win32.exe> -o `msr.tmp` && `move /y msr.tmp msr.exe` && `icacls msr.exe /grant %USERNAME%:RX` && **move** [msr.exe](https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.exe) `%SystemRoot%\`

    
  - **Linux**
    - `x86_64`: 64-bit `Ubuntu` / `CentOS` / `Fedora` / `WSL-on-Windows`

      **curl** <https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.gcc48> -o `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `sudo mv msr /usr/bin/msr`

    - `Arm64` (like `Ubuntu Arm64`):
      
      **curl** <https://raw.githubusercontent.com/qualiu/msr/master/tools/msr-aarch64.linux> -o `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `sudo mv msr /usr/bin/msr`

    - `x86` 32-bit `Ubuntu` / `CentOS` / `Fedora` / `WSL-on-Windows`

      **curl** <https://raw.githubusercontent.com/qualiu/msr/master/tools/msr-i386.gcc48> -o `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `sudo mv msr /usr/bin/msr`


  - **MacOS** `Darwin-Arm64`:
    
    **curl** <https://raw.githubusercontent.com/qualiu/msr/master/tools/msr-arm64.darwin> -o `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `sudo mv msr /usr/local/bin/msr`
    
  - **FreeBSD** `amd64`:
  
    **curl** <https://raw.githubusercontent.com/qualiu/msr/master/tools/msr-amd64.freebsd> -o `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `sudo mv msr /usr/local/bin/msr`

# Alternative Sources if Unable to Download msr/nin from GitHub
If you're unable to download msr/nin tools from [GitHub](https://github.com/qualiu/msr)(validation: [md5.txt](https://github.com/qualiu/msr/blob/master/tools/md5.txt)) by command lines above, try sources + command lines below:
- https://sourceforge.net/projects/avasattva/files/ to download msr/nin by commands or click URLs like:
  - **curl** "<https://master.dl.sourceforge.net/project/avasattva/msr.exe?viasf=1>" -o `msr.tmp` && `move /y msr.tmp msr.exe` && `icacls msr.exe /grant %USERNAME%:RX` && **move** [msr.exe](https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.exe) `%SystemRoot%\`
  - **wget** "<https://master.dl.sourceforge.net/project/avasattva/msr.gcc48?viasf=1>" -O `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `sudo mv msr /usr/bin/msr`
  - **curl** "<https://master.dl.sourceforge.net/project/avasattva/msr-arm64.darwin?viasf=1>" -o `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `sudo mv msr /usr/local/bin/msr`
  - File validation: [md5.txt](https://master.dl.sourceforge.net/project/avasattva/md5.txt?viasf=1)
- https://gitlab.com/lqm678/msr to download msr/nin by commands or click URLs like:
  - **curl** "<https://gitlab.com/lqm678/msr/-/raw/master/tools/msr.exe?inline=false>" -o `msr.tmp` && `move /y msr.tmp msr.exe` && `icacls msr.exe /grant %USERNAME%:RX` && **move** [msr.exe](https://raw.githubusercontent.com/qualiu/msr/master/tools/msr.exe) `%SystemRoot%\`
  - **wget** "<https://gitlab.com/lqm678/msr/-/raw/master/tools/msr.gcc48?inline=false>" -O `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `sudo mv msr /usr/bin/msr`
  - **curl** "<https://gitlab.com/lqm678/msr/-/raw/master/tools/msr-arm64.darwin?inline=false>" -o `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `sudo mv msr /usr/local/bin/msr`
  - File validation: [md5.txt](https://gitlab.com/lqm678/msr/-/blob/master/tools/md5.txt)
- https://gitee.com/qualiu/msr to manually download msr/nin.
  - File validation: [md5.txt](https://gitee.com/qualiu/msr/blob/master/tools/md5.txt)

Same with [GitHub downloading](#or-manually-download--set-path-once-and-forever) above: You can **use/create a folder** (in `%PATH%`/`$PATH`) to replace **`%SystemRoot%`** or **`/usr/bin/`** or **`/usr/local/bin/`**.

After done, you can directly run **msr --help** (or **msr -h** or just **msr**) should display [colorful usages and examples on Windows](https://qualiu.github.io/msr/usage-by-running/msr-Windows.html) or Linux like: [Fedora](https://qualiu.github.io/msr/usage-by-running/msr-Fedora-25.html) and [CentOS](https://qualiu.github.io/msr/usage-by-running/msr-CentOS-7.html).
