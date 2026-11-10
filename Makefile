.PHONY: setup dev test seed

setup:
	powershell -ExecutionPolicy Bypass -File ./run.ps1 setup

seed:
	powershell -ExecutionPolicy Bypass -File ./run.ps1 seed

test:
	powershell -ExecutionPolicy Bypass -File ./run.ps1 test

dev:
	powershell -ExecutionPolicy Bypass -File ./run.ps1 dev
