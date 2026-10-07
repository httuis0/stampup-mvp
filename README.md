# StampUp 🎟️

**StampUp** is a digital loyalty stamp card platform designed for small cafés, bakeries, and retail shops.
- Replaces paper loyalty stamp cards with a phone number and a digital counter.
- The cashier adds stamps in seconds. After collecting a set number of stamps, the customer claims a free reward.
- Customers scan a QR code with their phone camera to view their stamp card on the web — **no app download or customer registration required**.

---

## 1. The Two Parts

1. **Shop App** (Android first, iOS, and Web):
   - Used by the shop owner and cashier.
   - Built with **React Native**, **Expo (SDK 57)**, and **TypeScript**.
   - Features: Login/Signup, First-time Shop Setup, Cashier Stamp Screen (with 30s undo & 60m cooldown), Customer List (search & GDPR deletion), and Settings (QR code generator, link copy, and privacy policy).

2. **Customer Page** (Mobile-friendly web page):
   - Opened when a customer scans the shop's counter QR code (`/c/SHOP-SLUG`).
   - Built with ultra-lightweight, zero-dependency HTML, CSS, and vanilla JavaScript (< 15 KB).
   - Instant loading even on slow 2G connections and low-cost phones.
   - Securely queries only the customer's stamp balance via the `get_card` Supabase RPC function.

---

## 2. Tech Stack

- **Shop App:** React Native, Expo SDK 57, TypeScript
- **Backend:** Supabase (PostgreSQL database, Supabase Auth, Row Level Security, Postgres RPC functions)
- **Customer Page:** Lightweight standalone web page, runnable locally or hosted on any free host (Vercel, Netlify, Cloudflare Pages, GitHub Pages)
- **Zero Paid Services:** Completely free tier compliant.

---

## 3. Project File Structure

```text
build_stampup_mvp/
├── App.tsx                     # Main app root: auth state & bottom tab navigation
├── app.json                    # Expo project configuration
├── package.json                # Project dependencies and run scripts
├── tsconfig.json               # TypeScript configuration
├── .env                        # Local environment variables (git-ignored)
├── .env.example                # Environment variables template
├── PRIVACY_POLICY.md           # Draft privacy policy for review & Play Store
├── customer-web/               # Customer Web Page
│   ├── index.html              # Customer web application (< 15 KB)
│   ├── config.js               # Supabase public anon key config
│   └── serve.js                # Zero-dependency local Node.js server
├── src/
│   ├── components/
│   │   ├── BottomTabBar.tsx    # Bottom navigation tabs
│   │   └── ShopQRCode.tsx      # In-app dynamic QR Code with Share/Print
│   ├── constants/
│   │   ├── config.ts           # App settings (country code, cooldown, limits)
│   │   └── strings.ts          # Centralized UI copy (ready for i18n)
│   ├── lib/
│   │   └── supabase.ts         # Supabase client with AsyncStorage session persistence
│   ├── screens/
│   │   ├── AuthScreen.tsx      # Screen 1: Login & Account Creation
│   │   ├── ShopSetupScreen.tsx # Screen 2: First-time shop onboarding
│   │   ├── AddStampScreen.tsx  # Screen 3: Main cashier screen (add stamp, reward, undo)
│   │   ├── CustomersScreen.tsx # Screen 4: Customer list, search, and GDPR deletion
│   │   └── SettingsScreen.tsx  # Screen 5: QR Code, link copy, edit shop, privacy modal
│   ├── types/
│   │   └── index.ts            # TypeScript interfaces and RPC response types
│   └── utils/
│       ├── phone.ts            # Shared phone normalization (+971 UAE standard)
│       └── slug.ts             # Unique URL slug generator (e.g. chai-corner-x7k2)
└── supabase/
    ├── migrations/
    │   ├── 20261002000001_create_tables.sql # Tables: shops, customers, stamps, rewards
    │   ├── 20261002000002_enable_rls.sql    # Row Level Security (RLS) policies
    │   └── 20261002000003_sql_functions.sql # RPC: normalize_phone, add_stamp, give_reward, get_card, delete_customer, undo_last_stamp
    └── tests/
        ├── 01_rls_security_test.sql         # Proves Shop A cannot see Shop B customers
        └── 02_test_sql_functions.sql        # Proves phone normalization & RPC responses
```

---

## 4. How to Run

### Step A: Configure Environment Variables

Create or open `.env` in the root folder:
```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
EXPO_PUBLIC_CUSTOMER_WEB_URL=http://localhost:5173
```
*(Find these in Supabase Dashboard → Project Settings ⚙️ → API. **Never** use the `service_role` key).*

### Step B: Run the Shop App

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the Expo development server:
   ```bash
   npx expo start -c
   ```
3. Test the app:
   - **In your browser:** Press `w` in your terminal to open in Chrome/Safari.
   - **On Android phone:** Scan the QR code shown in your terminal with the free **Expo Go** app.

### Step C: Run the Customer Web Page

Open a second terminal window and run:
```bash
npm run customer
```
Open in your browser:
```text
http://localhost:5173/c/YOUR-SHOP-SLUG
```
*(Replace `YOUR-SHOP-SLUG` with your shop's slug from the Settings screen, e.g. `chai-corner-x7k2`).*

---

## 5. Security & Privacy Architecture

1. **Row Level Security (RLS):**
   - Enabled on all 4 tables (`shops`, `customers`, `stamps`, `rewards`).
   - Shop owners can read and write only rows belonging to their own shop (`shops.owner_id = auth.uid()`).
   - Shop A's owner can **never** see or query Shop B's customers.
2. **Anonymous Users Blocked:**
   - Unauthenticated visitors have **zero direct table access** (`REVOKE ALL ON TABLE ... FROM anon`).
   - The customer page may only call one single SQL function: `get_card(shop_slug, phone)`.
3. **`get_card` SQL Function:**
   - Runs as `SECURITY DEFINER` with a safe `search_path`.
   - Returns **only**: `shop_name`, `reward_text`, `stamps_required`, and `current_stamps`.
   - Never exposes phone numbers, customer lists, or IDs.
   - If an unrecognized phone number is entered, returns `current_stamps = 0` (never says "customer not found").
4. **Owner Customer Deletion (GDPR / Privacy):**
   - Owners can permanently delete customer records and all their associated stamp and reward history on request via `delete_customer(shop_id, phone)`.

---

## 6. Phone Number Rules

- **Default Country Code:** `+971` (UAE). Configured in `src/constants/config.ts`.
- **Formatting:** Strips spaces, dashes, brackets, and periods.
- **Accepted Formats:**
  - `0501234567` → stored as `+971501234567`
  - `971501234567` → stored as `+971501234567`
  - `+971501234567` → stored as `+971501234567`
- **Validation:** Digits must be between 8 and 15 digits. If invalid, displays: *"Please check the phone number."*

---

## 7. Test Checklist (Verified ✅)

Run through this checklist before launching with real shops:

- [x] **Shop A cannot see Shop B's customers:** Verified via RLS test (`supabase/tests/01_rls_security_test.sql`).
- [x] **A logged-out user cannot read any table:** Verified; direct table access revoked from `anon`.
- [x] **Three phone formats become the same stored number:** Verified via `normalize_phone` test (`supabase/tests/02_test_sql_functions.sql`).
- [x] **A second stamp within 60 minutes is blocked:** Verified; `add_stamp` returns `too_soon` with remaining minutes.
- [x] **A full card blocks new stamps until the reward is given:** Verified; `add_stamp` returns `card_full`.
- [x] **Reward resets stamps to 0 and adds 1 to rewards given:** Verified via `give_reward`.
- [x] **Customer page shows the right count:** Verified via `get_card`.
- [x] **Customer page shows nothing about other customers:** Verified; returns only individual stamp count.
- [x] **App works with slow connection and shows errors, not blank screen:** Verified with loading spinners and error banners.
- [x] **No keys inside code files:** Verified; all keys read from `.env` via `process.env.EXPO_PUBLIC_*`.

---

## 8. Resolved Risks & Limitations (Upgrades Implemented)

We addressed the original MVP risks and limitations with production-grade solutions:

1. **Anti-Scraping Rate Limiting & Auto-Remember (Resolved Risk #1):**
   - *Problem:* An attacker could repeatedly enter random numbers to find active customer stamp counts.
   - *Solution:* Implemented a client-side rate limiter on `customer-web/index.html` allowing max 5 attempts per minute before a 60-second lockout.
   - *Bonus:* Added local card remembering (`localStorage`) so returning customers scanning the counter QR code have their stamp card ready with zero typing!

2. **Manager PIN & Cashier Mode (Resolved Limitation #2):**
   - *Problem:* Sharing owner credentials with cashiers allowed staff to tamper with shop settings, delete customers, or see business data.
   - *Solution:* Created **Cashier Mode** with a custom 4-digit Manager PIN. When Cashier Mode is enabled, the app locks strictly to the **Add Stamp** screen. Bottom tabs and settings are hidden, and exiting requires the Manager PIN.

3. **Multi-Shop & Branch Switcher (Resolved Limitation #3):**
   - *Problem:* Owners with more than one café or location were restricted to a single shop.
   - *Solution:* Added full multi-branch management in Settings. Owners can create additional shops (e.g. "Chai Corner - Downtown", "Chai Corner - Mall") and switch between them with one tap.

4. **Customer Data Portability & CSV Export:**
   - Added a one-click **"📥 Export CSV"** button on the Customers screen, enabling owners to download and back up customer phone numbers, stamp counts, and visit dates at any time.

5. **Google Play Data Safety Compliance:**
   - Created a step-by-step submission guide at [`docs/GOOGLE_PLAY_DATA_SAFETY.md`](docs/GOOGLE_PLAY_DATA_SAFETY.md) with exact questionnaire answers for Google Play Console review.
