# RoomArt BCG Intelligence Platform

> Bloomberg Terminal × McKinsey Dashboard × Amazon Seller Analytics

A fully automated BCG Matrix Intelligence Platform for furniture brand **RoomArt** — built on GitHub Actions + GitHub Pages.

![Dashboard Preview](docs/preview.png)

---

## 🚀 Quick Start

### 1. Fork & Clone
```bash
git clone https://github.com/YOUR_USERNAME/roomart-bcg-ai.git
cd roomart-bcg-ai
```

### 2. Enable GitHub Pages
- Go to **Settings → Pages**
- Source: **GitHub Actions**
- Save

### 3. Enable GitHub Actions
- Go to **Actions** tab → Enable workflows

### 4. Run Initial Data Pipeline
```bash
# Manually trigger from Actions tab
# OR push any commit to main
```

The deploy workflow will automatically:
1. Run scraper → collect product & trend data
2. Run analyzer → compute BCG scores
3. Build React dashboard → deploy to GitHub Pages

**Dashboard URL:** `https://YOUR_USERNAME.github.io/roomart-bcg-ai/`

---

## 🖥️ Local Development

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173/roomart-bcg-ai/`

### Backend
```bash
pip install -r backend/requirements.txt
python backend/scraper.py    # Collect data
python backend/analyzer.py   # Compute BCG scores
cp data/*.json frontend/public/data/
```

---

## 📺 HDMI Kiosk Mode (TV Dashboard)

### Linux HDMI Setup
```bash
# Install Chromium kiosk dependencies
sudo apt-get install -y chromium-browser unclutter

# Create kiosk script
cat > ~/roomart-kiosk.sh << 'EOF'
#!/bin/bash
export DISPLAY=:0
xset s off
xset s noblank
xset -dpms
unclutter -root &
chromium-browser \
  --kiosk \
  --no-sandbox \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --window-size=1920,1080 \
  "https://YOUR_USERNAME.github.io/roomart-bcg-ai/"
EOF

chmod +x ~/roomart-kiosk.sh
~/roomart-kiosk.sh
```

### Auto-start on boot (systemd)
```bash
sudo nano /etc/systemd/system/roomart-kiosk.service
```
```ini
[Unit]
Description=RoomArt BCG Dashboard Kiosk
After=graphical.target

[Service]
User=YOUR_USER
Environment=DISPLAY=:0
ExecStart=/home/YOUR_USER/roomart-kiosk.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=graphical.target
```
```bash
sudo systemctl enable roomart-kiosk
sudo systemctl start roomart-kiosk
```

### Dashboard Fullscreen Mode
- Click **⊞ HDMI** button in top-right corner
- Browser will enter fullscreen mode
- Click tabs to cycle between views
- Data auto-refreshes every 5 minutes

---

## 🏗️ Architecture

```
roomart-bcg-ai/
├── frontend/               # React + Vite + TailwindCSS dashboard
│   ├── src/
│   │   ├── components/     # BCGMatrix, KPICards, TrendChart, etc.
│   │   ├── hooks/          # useData() data loading hook
│   │   └── utils/          # helpers, formatters
│   └── public/data/        # JSON data files served statically
│
├── backend/
│   ├── scraper.py          # Data collection (RoomArt, Trendyol, Trends)
│   └── analyzer.py         # BCG scoring + classification engine
│
├── data/                   # Generated JSON data files
│   ├── products.json
│   ├── trendyol.json
│   ├── trends.json
│   ├── bcg_scores.json
│   └── alerts.json
│
└── .github/workflows/
    ├── scrape.yml           # Runs every 6 hours
    ├── analyze.yml          # Triggered on data changes
    └── deploy.yml           # Deploys to GitHub Pages
```

---

## 📊 BCG Scoring Model

### Market Share Score
| Factor | Weight |
|--------|--------|
| Revenue rank in category | 25% |
| Review count | 20% |
| Rating signal | 15% |
| Price positioning | 10% |
| Stock health | 10% |
| Competition pressure | 10% |
| Margin proxy | 10% |

### Growth Score
| Factor | Weight |
|--------|--------|
| Google Trends growth | 30% |
| Category momentum (Trendyol) | 25% |
| Trend interest | 20% |
| Review momentum | 15% |
| New listings signal | 10% |

---

## 🤖 AI Decision Engine

| Condition | Action |
|-----------|--------|
| High growth + high margin + low competition | **INVEST** |
| High growth + moderate position | **SCALE** |
| Strong position + low growth + good margins | **HARVEST** |
| High growth + weak position + good margin | **INVEST** |
| High growth + weak position | **TEST** |
| Low growth + low margin + high returns | **EXIT** |
| Competitive pressure on cow | **DEFEND** |

---

## 🔧 Configuration

### Adding Real Scraping
Edit `backend/scraper.py`:
- Replace `generate_products()` with actual `requests + BeautifulSoup` scraping of `roomart.com.tr`
- Replace `get_trendyol_data()` with Trendyol API/scraping
- Replace `get_trends_data()` with real `pytrends` calls

### Connecting Real ERP Data
Drop a CSV with columns: `product_id, monthly_sales, revenue, cost, return_count` into `data/erp_upload.csv`
The analyzer will automatically pick it up on next run.

### Adjusting Scoring Weights
Edit the weight constants in `backend/analyzer.py`:
```python
# In calculate_market_share_score()
revenue_score = normalize(...) * 0.25   # Adjust this weight
review_score  = normalize(...) * 0.20   # etc.
```

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, Recharts, Framer Motion |
| Backend | Python 3.11, Pandas, BeautifulSoup, pytrends |
| Infra | GitHub Actions, GitHub Pages |
| Data | JSON flat files (upgrade to SQLite for scale) |

---

## License
MIT © RoomArt
