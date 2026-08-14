# Stock Analyzer Backend

Upload `api/` and `lib/` into the root of the Vercel backend project.

Endpoints: `/api/health`, `/api/data`, `/api/analyze`.

Vercel Environment Variables:
- `OPENAI_API_KEY` = your OpenAI API key
- `OPENAI_MODEL` = optional, defaults to `gpt-4o-mini`
- `ALLOWED_ORIGIN` = optional frontend URL

Market data uses Yahoo Finance public endpoints. Full audited fundamentals are not supplied by this endpoint; use a reliable fundamentals provider rather than inventing missing values.
