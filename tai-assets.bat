@echo off
setlocal
cd /d "%~dp0"
mkdir vendor\three 2>nul
curl -fL -o vendor\three\three.module.js https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js || goto :loi
echo.
echo XONG. Kich thuoc file (bytes), phai lon hon 1000000:
for /r vendor %%f in (*) do echo %%~zf  %%f
pause
exit /b 0
:loi
echo.
echo LOI: tai that bai. Chup man hinh gui lai.
pause
exit /b 1
