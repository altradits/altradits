# The Developer's Checklist for Day 085

1. **Placeholders Only:** Never use string formatting for SQL values.
2. **Sanitize HTML:** If you must render HTML, use a library like `bluemonday`.
3. **Validate Types:** If an input should be an Integer (like an amount), parse it as a `float64` immediately. Don't pass the raw string around.
4. **Contextual Encoding:** Remember that data safe for HTML might not be safe for a JavaScript attribute or a URL.



go get github.com/microcosm-cc/bluemonday

git add 04-Security/Day-085-sanitization/
git commit -m "feat(security): implement HTML sanitization and injection defense protocols"