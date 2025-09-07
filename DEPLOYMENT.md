# GitHub Pages Deployment Guide

## Quick Setup (5 minutes)

### 1. Create GitHub Repository
1. Go to [GitHub.com](https://github.com) and sign in
2. Click the "+" icon → "New repository"
3. Name it `TowerDefense` (or any name you prefer)
4. Make it **Public** (required for free GitHub Pages)
5. **Don't** initialize with README (we already have one)
6. Click "Create repository"

### 2. Upload Your Code
Run these commands in your project directory:

```bash
# Initialize git repository
git init

# Add all files
git add .

# Commit your changes
git commit -m "Initial tower defense game"

# Rename default branch to main
git branch -M main

# Add your GitHub repository as remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/TowerDefense.git

# Push to GitHub
git push -u origin main
```

### 3. Enable GitHub Pages
1. Go to your repository on GitHub
2. Click **Settings** tab
3. Scroll down to **Pages** section
4. Under **Source**, select "Deploy from a branch"
5. Choose **main** branch and **/ (root)** folder
6. Click **Save**

### 4. Access Your Game
- GitHub will build your site (takes 1-2 minutes)
- Your game will be available at: `https://YOUR_USERNAME.github.io/TowerDefense/`
- Update the README.md with your actual URL

## Updating Your Game

When you make changes:

```bash
git add .
git commit -m "Describe your changes"
git push
```

GitHub Pages will automatically update within a few minutes.

## Troubleshooting

- **404 Error**: Wait 2-3 minutes for GitHub Pages to build
- **Files not updating**: Clear browser cache or try incognito mode
- **Repository not found**: Make sure repository is public

## Custom Domain (Optional)

You can use a custom domain by:
1. Adding a `CNAME` file with your domain
2. Configuring DNS settings
3. Updating GitHub Pages settings

---

**Your tower defense game will be live and shareable! 🎮**
