import re
import sys

try:
    with open('sidepanel.html', 'r', encoding='utf-8') as f:
        html = f.read()

    style_match = re.search(r'<style>\s*(.*?)\s*</style>', html, re.DOTALL)
    if style_match:
        css = style_match.group(1)
        with open('sidepanel.css', 'w', encoding='utf-8') as f:
            f.write(css)
        html = html[:style_match.start()] + '<link rel="stylesheet" href="sidepanel.css" />' + html[style_match.end():]
        print("CSS extracted to sidepanel.css")

    # Add maxlength="10000" to textarea
    html = re.sub(
        r'(<textarea\s+id="textInput"[\s\S]*?)>',
        r'\1 maxlength="10000">',
        html
    )

    with open('sidepanel.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print("sidepanel.html updated")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
