# Brand Assets

## Available Assets

| Asset                   | Path                               | Status                                                                                                                                                                                |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary logo            | `public/brand/arbor-lyme-logo.svg` | **Supplied and in use.** Copied byte-for-byte from the approved source file (`Arbor_Lyme_Logo.svg`), verified via SHA-256 checksum match. Never redrawn, recreated, or reinterpreted. |
| Dark-background variant | —                                  | Not supplied. See "Future Branding Work."                                                                                                                                             |
| Standalone mark/icon    | —                                  | Not supplied. See "Future Branding Work."                                                                                                                                             |
| Favicon                 | —                                  | Not supplied. See "Future Branding Work."                                                                                                                                             |
| Apple touch icon        | —                                  | Not supplied. See "Future Branding Work."                                                                                                                                             |
| Open Graph image        | —                                  | Not supplied. See "Future Branding Work."                                                                                                                                             |

Only the one supplied asset is used anywhere in the application, per instruction: "If only one logo exists: use it unchanged, document any additional assets that would be beneficial later."

## A Note on the Source File's Format

The supplied `.svg` is an SVG wrapper around an embedded base64-encoded PNG raster (845×502px), not a vector path drawing. This is worth recording because it affects what can safely be done with it:

- It is used at native or downscaled display sizes without quality loss, but will not scale up beyond its native 845×502 resolution as cleanly as a true vector would.
- It is **not** run through any image re-encoding/optimization pipeline (including Next.js's built-in image optimizer) — re-encoding a raster is a form of modification, however subtle, and the instruction to never redraw, recreate, or reinterpret the logo is read to cover that. Every usage in the codebase uses a plain `<img>` element, not `next/image`, specifically for this reason.
- It is not a good source for a 16–32px favicon (a small, square mark is needed for that — see below) or for cropping/deriving other assets — no derivative asset has been generated from it in this milestone.

## Intended Usage

| Location                          | Treatment                                                                                                                                                                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in page                      | Centered, ~48px display height, above the "Sign in" heading.                                                                                                                                                                                                                           |
| Protected app header              | Left-aligned, ~32px display height (~36px at `sm` breakpoint and above), linking to `/dashboard`, with a subtle hover opacity transition. Increased from ~24px in Milestone 2.7 for greater visual presence — still well inside the native 845×502 raster's crisp-rendering range even at 2x pixel density (see below). |
| Browser favicon                   | Not set — no suitable square/small-scale asset exists yet (see below). The browser falls back to its own default; this is preferable to using a mismatched or degraded derivative.                                                                                                     |
| Open Graph / social preview image | Not set. Most social platforms (Twitter/X, LinkedIn, Facebook) do not render SVG for `og:image` at all — setting the logo here would show as broken or blank on those platforms rather than degrading gracefully, so it is deliberately omitted until a proper raster OG asset exists. |
| Application `<title>`/metadata    | Text only ("Arbor Lyme Capital") — the logo artwork itself is never used as a substitute for text metadata.                                                                                                                                                                            |

## Minimum Size

Given the raster-in-SVG nature of the source file, the logo should not be displayed below roughly **20px display height** — below that, the embedded raster's own resolution becomes the limiting factor for sharpness on high-density displays, not just legibility.

## Clear Space

No explicit clear-space specification was supplied with the asset. In the absence of one, a minimum clear space equal to the height of the logo's own bounding box is maintained on all sides wherever it's placed (the header and sign-in page layouts both give it dedicated padding, not tight-cropped placement against other elements) — a conservative, standard default, not a measured brand guideline.

## Accessibility

- Every use of the logo includes `alt="Arbor Lyme Capital"` — the accessible name matches the application's actual title, not a generic "logo" or empty alt (which would be appropriate only if the image were purely decorative _and_ adjacent text already conveyed the same information, which is not the case at either current usage site).
- The logo is never the sole conveyor of a page's heading semantics — see `src/app/(auth)/sign-in/page.tsx`, where the image carries the brand identity via `alt`, and a separate `<h1>Sign in</h1>` carries the page's actual semantic heading.

## Light and Dark Background Guidance

Only one colour variant was supplied. Without an approved dark-background variant, the logo is used as-is on both light and dark theme backgrounds in this milestone (the application's dark mode, `src/app/(protected)/settings`'s appearance setting, changes surrounding chrome, not the logo itself). If the supplied artwork does not read clearly on a dark background in practice, that is a signal a dark variant is genuinely needed (see below) — not something to solve by recolouring the artwork locally, which would violate "do not modify colours unless separate approved variants are supplied."

## Future Branding Work

Recommended, not committed to a phase — flagged here per instruction to document what would be beneficial later:

- **A true vector version** (real paths, not an embedded raster) for crisp scaling at any size, particularly for high-density displays and large-format future use (e.g., a marketing/landing context, if one is ever built).
- **A standalone square mark/icon**, separate from the full horizontal lockup, sized appropriately to derive a favicon (16×16, 32×32) and an Apple touch icon (180×180) without distortion or awkward cropping of the full lockup.
- **A dark-background variant**, if the current artwork's contrast proves insufficient on dark surfaces in practice.
- **A raster Open Graph image** (1200×630, PNG/JPG) for social link previews, since SVG is not reliably supported for this purpose across platforms.

## Repository Structure

```
public/
  brand/
    arbor-lyme-logo.svg    ← the only asset currently present
```

The originally recommended structure (favicon.svg, apple-touch-icon.png, dark variant, standalone mark) is not created speculatively — empty/placeholder brand files would be indistinguishable from real assets to anyone browsing the repo later, which is worse than their absence. Each is added when the corresponding real asset is supplied.
