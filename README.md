<div align="center">

# 🔬 Copilot Model Policy Simulator

**Evaluate the cost impact of AI model governance decisions before applying them**

[![React](https://img.shields.io/badge/react-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev)

[![Open App](https://img.shields.io/badge/Open_App-xrvk.github.io-2ea44f?style=for-the-badge)](https://xrvk.github.io/copilot-model-policy-simulator/)

---

_A browser-based simulator for GitHub Copilot enterprise admins._
_Upload usage data, simulate disabling models, project savings._

**[Try the live version →](https://xrvk.github.io/copilot-model-policy-simulator/)**

</div>

---

> **Client-side only.** No data leaves your browser. No server, no credentials, no tracking.

---

## ✨ Features

| 📊 Analyze | 🧪 Simulate | 📈 Project |
|-----------|------------|-----------|
| Spend breakdown by model and tier | Toggle models on/off in your policy | Monthly and quarterly savings |
| User count and date range detection | Choose where users redistribute | Per-seat cost impact |
| System-selected vs. user-chosen split | Quality impact grouping (Low/Med/High) | AIC reduction estimates |

---

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:5010** 🎉

Or try the live version: **https://xrvk.github.io/copilot-model-policy-simulator/**

---

## 📸 Screenshots

### Usage Summary
![Usage Summary](docs/screenshots/usage-summary.png)

### Policy Simulator
![Policy Simulator](docs/screenshots/policy-simulator.png)

### Projected Impact
![Projected Impact](docs/screenshots/projected-impact.png)

---

## 📖 How it works

1. **Import** your Premium Request Usage Report CSV from your GitHub enterprise billing page
2. **Visualize** current spend by model, category (Lightweight / Versatile / Powerful), and user count
3. **Simulate** disabling models from your Copilot policy and choosing where users would redirect
4. **Project** monthly and quarterly savings, per-seat impact, and quality tradeoff warnings

---

## ⚠️ Important caveats

- **Directional estimates only.** Different models tokenize the same prompt differently. Cost comparisons are approximate and meant to inform governance discussions, not serve as precise forecasts.
- **System-selected models** (Auto mode, Code Review, Coding Agent) are identified and excluded from simulation since admins cannot restrict them.
- Restricting model choices to save costs may reduce developer productivity with GitHub Copilot.

---

## 🛠️ Development

```bash
npm run dev        # dev server on :5010
npm run lint       # eslint
npm test           # vitest (14 tests)
npm run build      # production build
```

---

## 🔗 Related

- **[GitHub Copilot Docs](https://docs.github.com/en/copilot)** — Official GitHub Copilot documentation

