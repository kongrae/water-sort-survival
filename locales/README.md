# Botris localization

The game supports Korean, English, Japanese, Simplified/Traditional Chinese, Spanish, Brazilian Portuguese, Hindi and Indonesian.

Edit messages.tsv: each line has the original Korean key followed by eight translations, separated by |. The original key is also the Korean text. Despite the filename this is a pipe-delimited table; do not trim intentional leading/trailing spaces. Preserve numeric placeholders such as {0}; their order may change. Do not place | inside a message.

Run node build-pages.js to validate columns, duplicate keys, empty translations and placeholder parity, then embed the table and runtime.js into the standalone HTML. Translations require no network call or runtime dependency. The generated script#i18n should not be edited by hand.

For new UI messages, use tr(key, ...values) for dynamic text and add a row to the table. Static text and ARIA labels are captured from the existing markup and refreshed by the locale runtime. Translate color/theme names at render time.

Browser language is selected automatically in preference order, falling back to English. The Settings language selector overrides it and persists the preference under wsurv.locale. A ?lang=en URL can temporarily choose a language without altering stored preferences. Selecting a language removes that temporary override.

Language changes rerender labels without rebooting the game; rules, undo history and existing save keys remain intact. Language is a local preference and does not change cloud account or Firebase identifiers. UI translations include prototype/ad notices; they do not add real advertising or publish to app stores.

Validation: node uitest/i18n.js, node uitest/uiux.js, node uitest/expansion.js. The i18n suite uses an isolated browser profile and synthetic states, checks all languages on small screens and checks live-state/save preservation across switches. Native-speaker copy review and physical-device testing remain separate release work.
