DOMAIN=namey5
EXTENSION_NAME=extra-reboot-options
BUNDLE_ID=$(EXTENSION_NAME)@$(DOMAIN)
BUNDLE_ZIP=$(BUNDLE_ID).shell-extension.zip

.PHONY: all translate pack install clean

all: dist/extension.js

node_modules/.package-lock.json: package.json
	npm install

dist/extension.js: node_modules/.package-lock.json src/*.ts
	npm run build
	# tsc strips line breaks in emitted js - need to add back for EGO review
	npx eslint dist --config format.eslint.config.js --fix

out/$(BUNDLE_ZIP): dist/extension.js dist/metadata.json dist/po/* README.md LICENSE
	@-mkdir out
	gnome-extensions pack dist \
		--force \
		--podir="./po" \
		--extra-source="../README.md" \
		--extra-source="../LICENSE" \
		-o out

dist/po/example.pot: src/*.ts
	xgettext --from-code=UTF-8 --output=dist/po/example.pot src/*ts

translate: dist/po/example.pot

pack: out/$(BUNDLE_ZIP)

install: out/$(BUNDLE_ZIP)
	gnome-extensions install --force out/$(BUNDLE_ZIP)

clean:
	@rm -rf dist/extension.js out node_modules
