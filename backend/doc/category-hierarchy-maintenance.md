# Category Hierarchy Maintenance Guide

This project uses a data-driven category system.

The category structure is not entered manually in Liquid. It is generated from a JSON source file and then rendered in the header and landing pages.

## Where categories are stored

- Raw hierarchy source: [assets/product_categories.json](D:\IT MART24\System_Programs\shopify_theme\assets\product_categories.json)
- Generated storefront data: [assets/category-navigation-data.json](D:\IT MART24\System_Programs\shopify_theme\assets\category-navigation-data.json)
- Generated collection mapping file: [docs/category-collections.csv](D:\IT MART24\System_Programs\shopify_theme\docs\category-collections.csv)
- Generator script: [scripts/generate-category-navigation.ps1](D:\IT MART24\System_Programs\shopify_theme\scripts\generate-category-navigation.ps1)

## How the hierarchy works

- `Main Category` = top level like `Cloud Services`, `AI Tools`, `Software`
- `Sub Category` = child of a main category
- `Final Category` = the browsable end node that links to a Shopify collection

Important:

- The storefront links users to collections only at the `Final Category` level.
- `Software` is stored in the source JSON with a repeated final level, but the generator flattens it for the UI.

## How final categories link to collections

There is no separate manual link table inside the theme.

The link is created by the generated collection handle:

- Each final category becomes a collection URL like `/collections/{collection_handle}`
- The handle is generated from the final category slug
- If the same final slug appears more than once, the generator prefixes it with the subcategory slug

Examples:

- `Text-to-Speech AI` -> `/collections/text-to-speech-ai`
- `Other` under `Accessibility AI` -> `/collections/accessibility-ai-other`
- `Managed WordPress Hosting` under `Managed Hosting` -> `/collections/managed-hosting-managed-wordpress-hosting`

So to link a collection to a final category, create the Shopify collection with the exact generated handle.

## Before making changes

Always keep these in sync:

1. Update [assets/product_categories.json](D:\IT MART24\System_Programs\shopify_theme\assets\product_categories.json)
2. Regenerate the derived files
3. Create or update Shopify collections to match the generated handles
4. If you add a new main category, also update the theme activation points and create its landing page

## Add a new Main Category

Add a new top-level object to [assets/product_categories.json](D:\IT MART24\System_Programs\shopify_theme\assets\product_categories.json).

Required shape:

```json
{
  "id": "unique-id",
  "name": "New Main Category",
  "slug": "new-main-category",
  "isActive": true,
  "isDeleted": false,
  "order": 9999,
  "_subcollections": {
    "subcategories": []
  }
}
```

After adding it:

1. Add at least one subcategory and one final category under it.
2. Run the generator script.
3. Create a Shopify page with handle `new-main-category`.
4. Assign the `page.category-directory` template to that page.
5. Add the page to the main navigation.
6. Update these files so the custom menu recognizes the new main category handle:
   - [snippets/header-dropdown-menu.liquid](D:\IT MART24\System_Programs\shopify_theme\snippets\header-dropdown-menu.liquid)
   - [snippets/header-mega-menu.liquid](D:\IT MART24\System_Programs\shopify_theme\snippets\header-mega-menu.liquid)
   - [snippets/header-drawer.liquid](D:\IT MART24\System_Programs\shopify_theme\snippets\header-drawer.liquid)

Current note:

- Those files currently contain a fixed list of handled top-level menu handles.
- A brand-new main category will not automatically get the custom menu unless that list is updated.

## Add a new Sub Category

Find the correct main category in [assets/product_categories.json](D:\IT MART24\System_Programs\shopify_theme\assets\product_categories.json), then add a new object inside:

```json
"_subcollections": {
  "subcategories": [
    {
      "id": "unique-sub-id",
      "name": "New Sub Category",
      "slug": "new-sub-category",
      "isActive": true,
      "isDeleted": false,
      "order": 100,
      "_subcollections": {
        "subsubcategories": []
      }
    }
  ]
}
```

After adding it:

1. Add at least one final category under it.
2. Run the generator script.
3. Create Shopify collections for the generated final-category handles.

## Add a new Final Category

Find the correct subcategory in [assets/product_categories.json](D:\IT MART24\System_Programs\shopify_theme\assets\product_categories.json), then add a new object inside `subsubcategories`.

Example:

```json
{
  "id": "unique-final-id",
  "name": "New Final Category",
  "slug": "new-final-category",
  "isActive": true,
  "isDeleted": false,
  "order": 101
}
```

After adding it:

1. Run the generator script.
2. Check [docs/category-collections.csv](D:\IT MART24\System_Programs\shopify_theme\docs\category-collections.csv) for the generated `collection_handle`.
3. Create a Shopify collection with that exact handle.
4. Add products to that collection in Shopify Admin.

## If the final category is named "Other"

You do not need to manually invent a unique handle in JSON if the `slug` is still `other`.

The generator already makes it unique by prefixing the parent subcategory slug.

Examples:

- `Advertising AI > Other` -> `advertising-ai-other`
- `Accessibility AI > Other` -> `accessibility-ai-other`

## Recommended naming rules

Use these rules to keep the system predictable:

- `name` should be user-friendly
- `slug` should be lowercase and URL-safe
- Keep slugs stable once collections exist
- Avoid changing a slug after products have already been assigned to a collection

If you change a final-category slug:

- the generated collection handle may change
- the storefront URL may change
- you may need to rename or recreate the Shopify collection

## Regenerate the category files

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-category-navigation.ps1
```

This updates:

- [assets/category-navigation-data.json](D:\IT MART24\System_Programs\shopify_theme\assets\category-navigation-data.json)
- [docs/category-collections.csv](D:\IT MART24\System_Programs\shopify_theme\docs\category-collections.csv)

## How to create or update the Shopify collection

After regeneration:

1. Open [docs/category-collections.csv](D:\IT MART24\System_Programs\shopify_theme\docs\category-collections.csv)
2. Find the row for your final category
3. Copy the `collection_handle`
4. In Shopify Admin, create a collection with:
   - title matching the final category name
   - handle matching `collection_handle`
5. Assign products to that collection

That is the link between the final category and the products.

## Quick examples

### Example 1: Add a final category under AI Tools

Goal:

- `AI Tools` -> `Language AI` -> `AI Translation Tools`

Steps:

1. Add `AI Translation Tools` to the `Language AI` subcategory in the source JSON.
2. Run the generator script.
3. Check the generated collection handle, likely `ai-translation-tools`.
4. Create `/collections/ai-translation-tools` in Shopify.
5. Add products to that collection.

### Example 2: Add a new subcategory under Cloud Services

Goal:

- `Cloud Services` -> `Edge Hosting` -> `CDN Hosting`, `Edge Security`

Steps:

1. Add `Edge Hosting` as a new subcategory.
2. Add final categories under it.
3. Run the generator script.
4. Create the generated collections.

### Example 3: Add a new main category

Goal:

- `Business Services`

Steps:

1. Add a new top-level main category in the source JSON.
2. Add its subcategories and final categories.
3. Run the generator.
4. Create the landing page and assign `page.category-directory`.
5. Add it to the main navigation.
6. Update the 3 header snippet files so the custom menu supports the new handle.

## Best practice checklist

Before pushing changes:

- JSON structure is valid
- `isActive` is `true`
- `isDeleted` is `false`
- Slugs are correct
- Generator has been run
- Generated files updated
- Shopify collections created or updated
- Products assigned to the correct collections
- Landing page exists for any new main category
- Main navigation updated if needed
