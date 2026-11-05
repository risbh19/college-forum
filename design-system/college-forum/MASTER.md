# College Forum interface system

The installed UI/UX Pro Max skill guides this redesign. Verified searches: `student community forum content-first` (Community/Forum pattern), `minimalism` (Minimalism & Swiss Style), `keyboard focus forms` (UX), and `accessible navigation forms` (Next.js). Use only recommendations compatible with this repository's Next.js 15, Tailwind 3, same-origin gateway and privacy requirements.

## Visual direction

A light, content-first campus common room with clear typography, generous spacing and a single violet action color. The community pattern fits; its automatic OLED/academic font suggestions are overridden by the verified minimal style and system fonts for everyday reading. Member photos, invented activity counts and external font requests are excluded. Preserve Google-only member login, no public admin sign-in link, no first-time box and no numbered login steps.

## Tokens

| Role | Value |
| --- | --- |
| Canvas | `#F7F8FC` |
| Surface | `#FFFFFF` |
| Ink | `#17233B` |
| Secondary text | `#526078` |
| Border | `#DEE3ED` |
| Control boundary | `#8490A5` (3.22:1 on white) |
| Primary | `#5B3AC9` |
| Primary hover | `#4B2FA9` |
| Primary soft | `#F2EFFF` |
| Primary text | `#FFFFFF` |

Tailwind owns these tokens. System sans fonts avoid external requests. Body text is 16px, supporting labels 14px, metadata at least 12px. Cards use 16–24px radii, restrained shadows and 4/8px spacing increments. Main content has a 1440px maximum width, a 224px desktop sidebar and an optional 256px community rail.

## Interaction and accessibility

- At least 44px touch targets for buttons and main navigation; 48px inputs with 16px text.
- Visible focus, semantic headings/landmarks, labels, current navigation states and a skip link.
- Inline validation connects errors to fields and focuses the first invalid field. Preserve form content on failure.
- Use text and semantic state alongside color; icon controls have names and decorative icons are hidden.
- One primary action per context. No fake search, nonfunctional filters, invented metrics, new authentication methods or automatic content animations.
- Respect reduced motion. Sticky navigation must not cover focused content.
- User content wraps without horizontal overflow. Mobile boards use a labelled native selector and an explicit Go button so keyboard browsing does not navigate unexpectedly.
- Keep privacy qualifications: aliases provide pseudonyms, not guaranteed anonymity. No identity storage or authorization changes.

## Verification

Check login, feed, board, create-post, post/comments, username setup, privacy and admin views at 375/768/1024/1440px. Test keyboard focus, mobile landscape, enlarged text, reduced motion, contrast, form failures and real local-demo interactions. Run frontend regression tests, typecheck, lint and production build. Do not use production accounts or data for UI checks.
