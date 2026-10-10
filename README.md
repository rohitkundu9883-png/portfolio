# Modern Personal Portfolio & Admin Control Center

A high-performance personal portfolio website paired with a real-time Admin Control Center. Any change made in the admin dashboard (adding, editing, or deleting items) automatically and instantly updates the public portfolio website via **Server-Sent Events (SSE)** and **BroadcastChannel**.

---

## 🌟 Key Features

### 1. Public Portfolio (`http://localhost:3000`)
- **Luxury Aesthetic**: Deep futuristic dark theme with ambient glowing radial mesh, glassmorphism cards, and Google Fonts (*Outfit*, *Plus Jakarta Sans*, *JetBrains Mono*).
- **Home / Hero Section**:
  - Live availability badge with glowing pulse
  - High-res portrait card with 3D hover tilt & floating metric widgets
  - Dynamic headline, subtitle, bio tagline, and call-to-action buttons
  - PDF Resume download button
  - Key achievement counters (Years of Experience, Projects Shipped, Satisfaction rate, Commits)
  - Social media profile links
- **About Me Section**:
  - Narrative story & philosophy
  - Core competency cards (Scalable Systems, UX Mastery, Generative AI, Security)
  - Quick personal facts grid (Location, Availability, Education, Primary Stack)
- **Skills Section**:
  - Filter tabs (*All*, *Frontend*, *Backend*, *Cloud & DevOps*)
  - Skill cards with icons, category tags, years of experience, and animated progress bars
- **Projects Showcase**:
  - Filter categories (*All*, *AI & Cloud*, *Fintech*, *Web App*)
  - Cards featuring project covers, badges, tech stack tags, and metrics
  - Interactive **Project Details Modal** with architecture overview, high-res previews, and external links
- **Certificates & Accreditations**:
  - Verified badges with issuer, issue date, credential ID, and verification links
- **Resume & Journey**:
  - Interactive dual-column timeline for Work Experience and Academic Education
  - Key bullet point achievements and company details
- **Contact Section**:
  - Direct contact cards (Email, Phone, Location, Response Time)
  - **Live Contact Form**: Visitors can submit messages directly to your private Admin Inbox with instant validation and feedback
- **⚡ Instant Real-Time Sync**:
  - Automatically updates in real time whenever changes are saved in the Admin Dashboard — no manual page refresh required!

---

### 2. Admin Control Center (`http://localhost:3000/admin`)
- **Protected Access**: Session token authentication (pre-configured with demo credentials).
- **Overview Dashboard**: High-level counters for active projects, skills, certificates, and unread inquiries.
- **Full CRUD for Every Section**:
  - **Home**: Edit title, tagline, availability status, CTA buttons, avatar upload, and stats counters.
  - **About Me**: Edit narrative paragraphs, competency highlight cards, and personal info facts.
  - **Skills**: Add new skill, edit proficiency (1-100%), change category/icon/experience, or delete.
  - **Projects**: Add project, edit details, upload screenshots, toggle "Featured" status, or delete.
  - **Certificates**: Add, edit, or delete certificates and upload badge images.
  - **Resume**: Edit summary, upload new PDF resume, add/edit/delete Experience and Education entries.
  - **Contact & Socials**: Edit contact info and customize social platform URLs.
  - **Messages Inbox**: View inquiries submitted by visitors on the public site, mark as read, delete, or reply directly via email.
  - **Settings & Backups**: Change admin username and password, export portfolio as a JSON backup, or restore from a JSON file.

---

## 🚀 Getting Started

### 1. Installation & Start
The dependencies (`express`, `cors`, `multer`) are already installed.

To start the server:
```bash
npm start
```

Or for development:
```bash
npm run dev
```

### 2. Access Points
- **Public Portfolio**: [http://localhost:3000](http://localhost:3000)
- **Admin Dashboard**: [http://localhost:3000/admin](http://localhost:3000/admin)

### 3. Default Admin Credentials
- **Username**: `admin`
- **Password**: `admin123`
*(Can be changed anytime inside the Admin Dashboard -> Settings tab)*

---

## 📂 Project Architecture

```
e:/porefolio/
├── data/
│   ├── portfolio.json        # Persistent database for all portfolio sections
│   └── messages.json         # Contact inquiries inbox
├── public/
│   ├── css/
│   │   ├── portfolio.css     # Public portfolio styles & glassmorphism
│   │   └── admin.css         # Admin dashboard theme & controls
│   ├── js/
│   │   ├── portfolio.js      # Public portfolio dynamic rendering & real-time sync
│   │   └── admin.js          # Admin dashboard SPA logic & file uploaders
│   ├── uploads/              # Uploaded images, badges, and resume PDFs
│   │   ├── avatar.jpg
│   │   ├── project_saas.jpg
│   │   ├── project_fintech.jpg
│   │   ├── cert_cloud.jpg
│   │   └── Alex_Rivera_Resume.pdf
│   ├── index.html            # Public Portfolio Website
│   └── admin.html            # Admin Control Center
├── scripts/
│   ├── test-api.js           # API testing script
│   └── test-full-crud.js     # Comprehensive E2E CRUD verification script
├── server.js                 # Express server with RESTful API, Multer upload & SSE
└── package.json
```

---

## 🔄 How the Auto-Update Works
1. When you save an edit or perform an add/delete in the Admin Dashboard, the server updates `data/portfolio.json`.
2. The server broadcasts an SSE event (`PORTFOLIO_UPDATED`) to all connected browser tabs.
3. Simultaneously, a client `BroadcastChannel` event pings any other active tabs.
4. The public portfolio immediately pulls the updated data and seamlessly re-renders with a subtle update banner.
