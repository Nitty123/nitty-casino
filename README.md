# NITTY — Private Suite

A private banking + casino web app. Hosted free on GitHub Pages, powered by Firebase Firestore for real-time cross-device data sync.

## 🚀 How to deploy (5 minutes)

### 1. Create a GitHub repository

1. Go to [github.com/new](https://github.com/new)
2. Name it anything, e.g. `nitty-casino`
3. Set it to **Public** (required for free GitHub Pages)
4. Click **Create repository**

### 2. Upload the files

In the new repo, click **uploading an existing file** and drag in:
- `index.html`
- `bank.html`
- `casino.html`
- `.github/` folder (the whole folder)

Or use Git:
```bash
git init
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/nitty-casino.git
git push -u origin main
```

### 3. Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. Save

### 4. Set up Firebase Firestore

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Open project **nitty-casino**
3. Go to **Firestore Database** → Create database
4. Choose **Start in test mode** (allows open read/write for 30 days — change rules after)
5. Pick any region and click **Done**

### 5. Done! 🎉

After ~2 minutes, your site is live at:
```
https://YOUR_USERNAME.github.io/nitty-casino/
```

---

## 🔒 Firebase Security Rules (optional, recommended)

After testing, update Firestore rules to secure your data:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if true; // keep open for this demo app
    }
  }
}
```

---

## 📁 Files

| File | Description |
|------|-------------|
| `index.html` | Landing page with links to bank and casino |
| `bank.html` | Vault Bank — accounts, cards, transfers |
| `casino.html` | NEXUS Casino — Blackjack with chip action |
