NODE ?= node
.PHONY: import train backtest export verify
import train backtest export verify:
	$(NODE) tests/acceptance/run.mjs $@
