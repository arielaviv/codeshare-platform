# Mr8 E2B Templates

Two custom E2B sandbox templates power Mr8 Computer:

| Template | Purpose | Base image | SDK |
|----------|---------|------------|-----|
| `mr8-compute` | Python REPL for data/scraping/docs | `e2bdev/code-interpreter` | `@e2b/code-interpreter` |
| `mr8-desktop` | Chromium + Playwright for browser automation | `e2bdev/desktop` | `@e2b/desktop` |

## Prerequisites

- E2B CLI: `npm i -g @e2b/cli`
- Logged in: `e2b auth login`

## Build + push both templates

```bash
cd backend
./scripts/build-e2b-templates.sh
```

The script prints the resulting template IDs. Copy them into `backend/.env`:

```
E2B_COMPUTE_TEMPLATE_ID=tmpl_xxxxxxxx
E2B_DESKTOP_TEMPLATE_ID=tmpl_yyyyyyyy
```

## When to rebuild

Rebuild when:

- Any pinned Python package version changes
- The base E2B image updates and you want fresh security patches
- You add a new system dependency (fonts, native libs)

Templates are built **once per release** locally — not on every backend deploy.

## Layer / library cheatsheet

**mr8-compute ships with** (for the agent to import freely):

- Data: `pandas`, `numpy`, `scipy`, `scikit-learn`
- Viz: `matplotlib`, `seaborn`, `Pillow`
- Scraping: `httpx`, `requests`, `beautifulsoup4`, `lxml`, `trafilatura`, `readability-lxml`
- Office: `openpyxl` (xlsx), `python-pptx`, `PyPDF2`, `pdfplumber`, `markdown`
- Code quality: `black`, `ruff`

**mr8-desktop ships with:**

- Chromium 120+ (autostarts on `--remote-debugging-port=9222`)
- `playwright` + pre-downloaded browsers
- Noto CJK / Hebrew / Arabic fonts (matches Mr8's i18n posture)
- Text extraction: `trafilatura`, `readability-lxml`

## Local development without building templates

Set in `.env` to fall back to E2B defaults:

```
E2B_COMPUTE_TEMPLATE_ID=
E2B_DESKTOP_TEMPLATE_ID=
```

The `e2b-client.ts` helper will use E2B's stock templates when these are empty. You lose the pre-installed libs, but you can still develop the handler plumbing.
