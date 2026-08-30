# Udupi Property Explorer

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## Testing

### Unit tests (Vitest)

```sh
npm run test          # single run
npm run test:watch    # watch mode — re-runs on save
npx vitest --ui       # browser UI at localhost:51204 with test explorer + diffs
```

Tests live in `apps/web/src/**/*.test.tsx`.

### E2E tests (Playwright)

By default e2e runs headless against production. To run locally against the dev server:

```sh
# Terminal 1
npm run dev

# Terminal 2 — interactive UI mode (recommended)
PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test --ui

# Or headed (watch the browser)
PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test --headed

# View the HTML report after any run
npx playwright show-report
```

Tests live in `e2e/`.

### Before merging a PR

```sh
npm run test          # unit tests must pass
npm run test:e2e      # e2e must pass
```

---

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
