name: Sync Products

on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Debug
        run: |
          pwd
          ls -la
          ls -la scripts/ || echo "No scripts folder"

      - name: Run sync
        run: node scripts/sync.js
        env:
          AFFILAE_TOKEN:        ${{ secrets.AFFILAE_TOKEN }}
          SUPABASE_URL:         ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          EFFINITY_FEEDS:       ${{ secrets.EFFINITY_FEEDS }}
