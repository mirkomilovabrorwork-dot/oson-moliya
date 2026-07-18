rem 2026-07-18: this branch used to `exit /b 0` when deps were missing - a SILENT pass. Worse than
rem having no gate at all: a missing gate.cmd triggers the honest-skip advisory, while a gate that
rem exits 0 reports GREEN and nothing warns anyone. An unverified commit must never look verified.
if not exist node_modules ( echo gate-FAIL: deps not installed - run "npm install" ^(this gate must not pass what it did not check^) & exit /b 1 )
set "PATH=C:\Program Files\nodejs;%PATH%"
call npm run typecheck
