# Simcorp Pipeline Intelligence — Deployment Guide
# SimCorpCloud · Project Unicorn

---

## What you are deploying

```
GitHub Pages (free)          ← your team clicks this URL
      ↓
Azure Function (proxy)       ← fetches ADO data on your behalf
      ↓
Azure Key Vault              ← stores your PAT securely
      ↓
Azure DevOps REST API        ← real pipeline data
```

---

## STEP 1 — Create Azure Function App

Open Azure Portal → https://portal.azure.com

1. Search "Function App" → Create
2. Fill in:
   - Subscription: your existing subscription
   - Resource Group: create new → "pipeline-dashboard-rg"
   - Function App name: "simcorp-pipeline-proxy" (or any name)
   - Runtime stack: Node.js
   - Version: 18 LTS
   - Region: same as your ADO region (e.g. West Europe)
3. Click Review + Create → Create
4. Wait ~2 minutes for deployment

---

## STEP 2 — Deploy the Function code

In Azure Portal, open your new Function App:

1. Click "Functions" → "+ Create"
2. Select "HTTP trigger"
3. Name: "PipelineDashboard"
4. Auth level: "Function"
5. Click Create

Then:
1. Click the new function → "Code + Test"
2. Delete all existing code in index.js
3. Paste the entire contents of azure-function/index.js from this repo
4. Click Save

---

## STEP 3 — Create Azure Key Vault

In Azure Portal:

1. Search "Key Vault" → Create
2. Fill in:
   - Resource Group: "pipeline-dashboard-rg" (same as above)
   - Name: "simcorp-dash-kv"
   - Region: same region
3. Click Review + Create → Create

Add your PAT secret:
1. Open the Key Vault → "Secrets" → "+ Generate/Import"
2. Name: "ADO-PAT"
3. Value: paste your ADO Personal Access Token here
4. Click Create

---

## STEP 4 — Connect Key Vault to Function App

Give your Function App permission to read the secret:

1. Open your Function App → "Identity" → System assigned → turn ON → Save
2. Copy the Object (principal) ID shown
3. Go back to Key Vault → "Access policies" → "+ Add Access Policy"
4. Secret permissions: tick "Get" and "List"
5. Select principal: paste the Object ID from step 2
6. Click Add → Save

Now add the Key Vault reference to your Function App:

1. Open Function App → "Configuration" → "+ New application setting"
2. Name:  ADO_PAT
3. Value: @Microsoft.KeyVault(SecretUri=https://simcorp-dash-kv.vault.azure.net/secrets/ADO-PAT/)
   (replace simcorp-dash-kv with your actual Key Vault name)
4. Click OK → Save → Confirm

---

## STEP 5 — Get your Function URL

1. Open Function App → Functions → PipelineDashboard
2. Click "Get Function URL"
3. Copy the full URL — it looks like:
   https://simcorp-pipeline-proxy.azurewebsites.net/api/PipelineDashboard?code=XXXXXXXX

Save this URL — you need it in Step 6.

---

## STEP 6 — Wire the dashboard to your Function

Open index.html in a text editor.

Find this line near the top of the <script> section:
  const FUNCTION_URL = "https://YOUR-FUNCTION-APP.azurewebsites.net/api/PipelineDashboard";

Replace it with your actual Function URL from Step 5:
  const FUNCTION_URL = "https://simcorp-pipeline-proxy.azurewebsites.net/api/PipelineDashboard?code=XXXXXXXX";

Save the file.

---

## STEP 7 — Deploy to GitHub Pages

1. Go to https://github.com → New repository
2. Name: "pipeline-dashboard" (or any name)
3. Set to Public (required for free GitHub Pages)
4. Click Create repository

Upload the file:
1. Click "uploading an existing file"
2. Drag and drop index.html
3. Commit message: "Initial deploy"
4. Click "Commit changes"

Enable GitHub Pages:
1. Go to repository Settings → Pages
2. Source: Deploy from a branch
3. Branch: main → / (root)
4. Click Save

Wait 1-2 minutes. Your URL will appear:
  https://YOUR-GITHUB-USERNAME.github.io/pipeline-dashboard/

---

## STEP 8 — Share with your team

Send this URL to your team and management:
  https://YOUR-GITHUB-USERNAME.github.io/pipeline-dashboard/

That's it. They click the link, see the landing page, choose Command Center or War Room, and see real live data from Azure DevOps — Project Unicorn.

No login. No PAT. No setup on their side.

---

## Troubleshooting

Dashboard shows "demo data" instead of real data:
→ Check your FUNCTION_URL in index.html includes the ?code= parameter
→ Check the Function App is running in Azure Portal
→ Check the ADO_PAT environment variable is set correctly
→ Check your PAT has not expired (set it to 1 year when creating)

CORS error in browser console:
→ Your Azure Function already handles CORS with Access-Control-Allow-Origin: *
→ If still failing, go to Function App → CORS → add your GitHub Pages URL

PAT permissions error:
→ Regenerate PAT with these scopes: Build (Read), Release (Read), Agent Pools (Read), Analytics (Read)
→ Update the secret value in Key Vault → Secrets → ADO-PAT → New Version

---

## Updating the dashboard

When you want to add features:
1. Edit index.html locally
2. Go to your GitHub repo → index.html → Edit (pencil icon)
3. Paste the updated content
4. Commit
5. GitHub Pages auto-deploys in ~1 minute

---

## Cost estimate

Azure Function:     Free tier covers 1M requests/month — $0
Azure Key Vault:    ~$0.03/month for secret storage
GitHub Pages:       Free
Total:              ~$0/month
