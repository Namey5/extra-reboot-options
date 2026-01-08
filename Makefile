DOMAIN=namey5
EXTENSION_NAME=extra-reboot-options
BUNDLE_ID=$(EXTENSION_NAME)@$(DOMAIN)
BUNDLE_ZIP=$(BUNDLE_ID).shell-extension.zip

.PHONY: all pack install clean

all: out/dist/extension.js

node_modules/.package-lock.json: package.json
	npm install

out/dist/extension.js: node_modules/.package-lock.json src/extension.ts
	npm run build

out/dist/metadata.json: src/metadata.json
	@cp src/metadata.json out/dist/metadata.json

out/$(BUNDLE_ZIP): out/dist/extension.js out/dist/metadata.json po/* README.md LICENSE
	gnome-extensions pack out/dist \
		--force \
		--podir="../../po" \
		--extra-source="../../README.md" \
		--extra-source="../../LICENSE" \
		-o out

pack: out/$(BUNDLE_ZIP)

install: out/$(BUNDLE_ZIP)
	gnome-extensions install --force out/$(BUNDLE_ZIP)

clean:
	@rm -rf out node_modules
