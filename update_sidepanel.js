const fs = require('fs');

try {
    let html = fs.readFileSync('sidepanel.html', 'utf-8');

    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    if (styleMatch) {
        const css = styleMatch[1];
        fs.writeFileSync('sidepanel.css', css, 'utf-8');
        html = html.substring(0, styleMatch.index) + '<link rel="stylesheet" href="sidepanel.css" />' + html.substring(styleMatch.index + styleMatch[0].length);
        console.log("CSS extracted to sidepanel.css");
    }

    // Add maxlength="10000" to textarea
    html = html.replace(/(<textarea\s+id="textInput"[\s\S]*?)>/, '$1 maxlength="10000">');

    fs.writeFileSync('sidepanel.html', html, 'utf-8');
    console.log("sidepanel.html updated");
} catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
}
