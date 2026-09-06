import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { stripCaptionUI, cleanArticleText, cleanPlainText } from "../src/articleCleaner.js";

// Polyfill DOMParser globally for testing cleanArticleText in Node
globalThis.DOMParser = DOMParser;

console.log("Running Article Caption UI Cleaner test suite...\n");

// ─── Test 1: User's Exact NPR Caption HTML ──────────────────────────────────
{
  const html = `
    <article>
      <p>El-Sayed has come under criticism for his association with the left-wing streamer Hasan Piker.</p>
      <figure class="image">
        <div class="imagewrap">
          <img src="poolside.jpg" alt="Poolside talk">
        </div>
        <div class="caption-wrap">
          <div class="caption">
            <p>Above, El-Sayed and Piker talk poolside at a party for content creators supporting the El-Sayed campaign on August 3, 2026, in Detroit.</p>
            <div class="credit-wrap">
              <span class="credit">Julia Demaree Nikhinson/AP</span>
              <b class="hide-caption">hide caption</b>
            </div>
          </div>
          <b class="toggle-caption">toggle caption</b>
        </div>
      </figure>
      <p>El-Sayed sought to distance himself from the controversy, calling antisemitism a scourge.</p>
    </article>
  `;

  const cleaned = cleanArticleText(html);

  assert.ok(
    cleaned.includes("Above, El-Sayed and Piker talk poolside at a party for content creators supporting the El-Sayed campaign on August 3, 2026, in Detroit."),
    "Should preserve the authentic caption description"
  );
  assert.ok(
    cleaned.includes("Julia Demaree Nikhinson/AP"),
    "Should preserve the photographer and agency credit"
  );
  assert.ok(
    !cleaned.toLowerCase().includes("hide caption"),
    "Should completely remove 'hide caption'"
  );
  assert.ok(
    !cleaned.toLowerCase().includes("toggle caption"),
    "Should completely remove 'toggle caption'"
  );
  console.log("✓ User's NPR caption HTML: authentic caption & credit preserved, all toggle controls stripped");
}

// ─── Test 2: Regression Fixture 1 — Literal prose containing toggle phrases ───
{
  const html = `
    <article>
      <p>The interface includes a hide caption option.</p>
      <p>Users can also find a toggle caption setting in the preferences menu.</p>
    </article>
  `;

  const cleaned = cleanArticleText(html);

  assert.ok(
    cleaned.includes("The interface includes a hide caption option."),
    "Prose containing 'a hide caption option' must survive completely unchanged"
  );
  assert.ok(
    cleaned.includes("Users can also find a toggle caption setting in the preferences menu."),
    "Prose containing 'a toggle caption setting' must survive completely unchanged"
  );
  console.log("✓ Regression Fixture 1: Literal prose containing toggle phrases survives unchanged");
}

// ─── Test 3: Regression Fixture 2 — Inline <em>caption</em> inside a sentence ──
{
  const html = `
    <article>
      <p>The photographer provided a detailed <em>caption</em> for the historical image.</p>
      <figure>
        <figcaption>
          <p>An archival photo where the original <em>caption</em> was written in pencil on the reverse side.</p>
        </figcaption>
      </figure>
    </article>
  `;

  const cleaned = cleanArticleText(html);

  assert.ok(
    cleaned.includes("The photographer provided a detailed caption for the historical image."),
    "Inline <em>caption</em> in article body prose must preserve the word 'caption'"
  );
  assert.ok(
    cleaned.includes("An archival photo where the original caption was written in pencil on the reverse side."),
    "Inline <em>caption</em> inside figure/figcaption must preserve the word 'caption'"
  );
  console.log("✓ Regression Fixture 2: Inline <em>caption</em> inside a sentence is not deleted");
}

// ─── Test 4: Regression Fixture 3 — Interactive button in figure/figcaption ──
{
  const html = `
    <article>
      <figure>
        <img src="chart.png">
        <figcaption>
          <button class="caption-toggle" aria-expanded="false">Toggle Caption</button>
          <p>Graph depicting economic output from 2020 to 2026.</p>
        </figcaption>
      </figure>
    </article>
  `;

  const cleaned = cleanArticleText(html);

  assert.ok(
    cleaned.includes("Graph depicting economic output from 2020 to 2026."),
    "Real caption text must be preserved"
  );
  assert.ok(
    !cleaned.toLowerCase().includes("toggle caption"),
    "Interactive button in figure must be removed"
  );
  console.log("✓ Regression Fixture 3: Interactive button in figure/figcaption is cleanly stripped");
}

// ─── Test 5: Standalone label badge before caption ──────────────────────────
{
  const html = `
    <article>
      <figure>
        <b class="caption-label">Caption</b>
        <p>A panoramic view of the Detroit riverfront at dusk.</p>
      </figure>
    </article>
  `;

  const cleaned = cleanArticleText(html);

  assert.ok(
    cleaned.includes("A panoramic view of the Detroit riverfront at dusk."),
    "Caption text must be preserved"
  );
  assert.ok(
    !cleaned.startsWith("Caption\n\n"),
    "Standalone caption label badge before caption must be stripped"
  );
  console.log("✓ Standalone caption label badge stripped while preserving caption");
}

// ─── Test 6: Fallback cleanPlainText behavior ────────────────────────────────
{
  const plain = [
    "Introduction paragraph.",
    "Julia Demaree Nikhinson/AP hide caption",
    "toggle caption",
    "The interface includes a hide caption option.",
    "Conclusion paragraph."
  ].join("\n");

  const cleaned = cleanPlainText(plain);

  assert.ok(!cleaned.includes("toggle caption\n"), "Standalone toggle caption line removed");
  assert.ok(cleaned.includes("Julia Demaree Nikhinson/AP"), "Photographer credit preserved");
  assert.ok(!cleaned.includes("Nikhinson/AP hide caption"), "Trailing 'hide caption' on credit line stripped");
  assert.ok(
    cleaned.includes("The interface includes a hide caption option."),
    "Prose containing 'hide caption option' preserved in plain text cleaner"
  );
  console.log("✓ Fallback plain text cleaner: handles trailing tokens and preserves prose");
}

console.log("\nAll Article Caption UI Cleaner tests passed successfully!");
