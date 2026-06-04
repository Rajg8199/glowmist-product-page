# GlowMist Shopify Developer Assignment

Custom Shopify OS 2.0 landing page for the fictional D2C skincare brand GlowMist.

## What is included

- `sections/glowmist-product-landing.liquid`: custom editable Shopify section.
- `templates/page.glowmist.json`: page template that loads the landing section with populated sample blocks.
- `layout/theme.liquid`: minimal Shopify layout with basic SEO meta structure.
- `assets/glowmist-product.png`: generated dummy product image for the fallback hero visual.
- `config/settings_schema.json`: minimal theme metadata.

## Key features

- Hero with product image, headline, subheadline, price, offer badge, primary CTA, and secondary links.
- Benefits, ingredients, how-to-use, reviews, FAQ accordion, trust badges, and announcement bar.
- Product selector, hero image, CTA copy, colors, and content blocks are editable from Shopify Customizer.
- AJAX Add to Cart using `/cart/add.js`.
- Variant selector appears automatically when the selected product has multiple variants.
- Quantity selector, loading state, success/error messaging, and cart drawer event hooks.
- Sticky Add to Cart bar appears after the hero scrolls out of view.
- Responsive layout for mobile, tablet, and desktop.

## Setup

1. Upload this folder as a Shopify theme or copy the files into an existing OS 2.0 theme.
2. In Shopify Admin, create a page and assign the `page.glowmist` template.
3. Open the theme customizer and select the real GlowMist product in the section settings.
4. Replace the fallback hero image if a production image is available.

## Cart drawer assumption

The section dispatches `cart:refresh` and `cart:open` events after a successful add. Existing Shopify themes often listen for their own cart drawer events, so the event names may need to be mapped if this is merged into a specific production theme.

## Walkthrough notes

- The main section schema contains settings for headline, subheadline, product selector, hero image, CTA text, colors, and reusable blocks.
- Benefits, ingredients, reviews, FAQs, and trust badges are modeled as Shopify blocks so the merchant can add, remove, and reorder content.
- The Add to Cart flow reads the selected variant ID and quantity, posts JSON to `/cart/add.js`, then shows a status message and emits cart drawer events.
