DOMAIN=namey5
EXTENSION_NAME=extra-reboot-options
BUNDLE_ID=$(EXTENSION_NAME)@$(DOMAIN)
BUNDLE_ZIP=$(BUNDLE_ID).shell-extension.zip

.PHONY: all translate pack install clean

all: out/dist/extension.js

node_modules/.package-lock.json: package.json
	npm install

out/dist/extension.js: node_modules/.package-lock.json src/*.ts
	npm run build
	# tsc strips line breaks in emitted js - need to add back for EGO review
	npx eslint out --config format.eslint.config.js --fix

out/dist/metadata.json: src/metadata.json
	@cp src/metadata.json out/dist/metadata.json

out/$(BUNDLE_ZIP): out/dist/extension.js out/dist/metadata.json po/* README.md LICENSE
	gnome-extensions pack out/dist \
		--force \
		--podir="../../po" \
		--extra-source="../../README.md" \
		--extra-source="../../LICENSE" \
		-o out

po/example.pot: src/*.ts
	xgettext --from-code=UTF-8 --output=po/example.pot src/*ts

translate: po/example.pot

pack: out/$(BUNDLE_ZIP)

install: out/$(BUNDLE_ZIP)
	gnome-extensions install --force out/$(BUNDLE_ZIP)

clean:
	@rm -rf out node_modules
