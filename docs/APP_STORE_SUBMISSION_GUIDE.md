# Luma: App Store & Google Play Store Submission Guide

This guide contains everything required to publish **Luma** (`com.lumalearning.english`) to the Apple App Store and Google Play Store.

---

## 1. App Identity & Store Metadata

### General Info
* **App Name:** Luma: Learn Spoken English
* **Subtitle (iOS):** Conversations & Daily Fluency (30 characters max)
* **Short Description (Android):** Speak English with confidence through daily AI teacher role-plays and smart review. (80 chars max)
* **Bundle Identifier (iOS):** `com.lumalearning.english`
* **Package Name (Android):** `com.lumalearning.english`
* **Current Version:** `1.0.0`
* **iOS Build Number:** `1`
* **Android Version Code:** `1`
* **Primary Category:** Education
* **Secondary Category:** Productivity / Lifestyle
* **Age Rating:** 4+ (Apple) / Everyone (Google Play)

### Full Description (Store Listing)
```markdown
Speak English with confidence from day one with Luma.

Whether you're starting from scratch (Pre-A1) or looking to speak more naturally in meetings, interviews, travel, and daily conversations, Luma gives you a patient, personalized learning path with an AI English teacher.

WHY LEARN WITH LUMA:
• Real-Life Conversations: Practice ordering at a café, checking into a hotel, handling job interviews, and speaking at work in realistic 3-minute role-plays.
• Patient AI Teachers (Maya & Leo): Hear natural, clear pronunciation and receive instant, gentle corrections on your grammar and sentence structure.
• Smart Review & Recall: Never forget words or phrases. Spaced-repetition drills bring back tricky vocabulary right before you forget them.
• Bilingual Learning: Toggle seamless explanations in your native language (including complete support for Bangla / বাংলা and English).
• Visual Learning Path: Track CEFR-aligned milestones from Starter to Intermediate with daily streaks and XP rewards.

LUMA PRO SUBSCRIPTIONS:
Unlock unlimited AI speaking sessions, full CEFR curriculum, and offline access with Luma Pro:
• Annual Plan: 7-Day Free Trial, then $59.99/year (Save 50%)
• Monthly Plan: $9.99/month (Cancel anytime)

Privacy Policy: https://lumalearning.english/privacy
Terms of Use (EULA): https://lumalearning.english/terms
Support: support@lumalearning.english
```

---

## 2. In-App Purchases & Subscriptions Setup

### Apple App Store Connect
Create an **Auto-Renewable Subscription Group** named `Luma Pro Subscriptions`:

1. **Annual Plan:**
   * **Product ID:** `com.lumalearning.english.annual`
   * **Reference Name:** `Luma Pro Annual`
   * **Duration:** 1 Year
   * **Introductory Offer:** 7-Day Free Trial (Pay-As-You-Go / Free)
   * **Price:** \$59.99 USD (Tier 60)

2. **Monthly Plan:**
   * **Product ID:** `com.lumalearning.english.monthly`
   * **Reference Name:** `Luma Pro Monthly`
   * **Duration:** 1 Month
   * **Price:** \$9.99 USD (Tier 10)

### Google Play Console
Create a **Subscription** named `luma-pro-subscription`:
* **Base Plan 1:** `annual-trial-7d` (\$59.99/year with 7 days free trial)
* **Base Plan 2:** `monthly` (\$9.99/month)

---

## 3. Privacy Nutrition Labels & Data Safety

### Apple App Store Privacy Declarations
* **Data Used to Track You:** None.
* **Data Linked to You:**
  * **Contact Info:** Name, Email (for account creation & cloud progress sync)
  * **User Content:** Audio / Spoken Voice (for pronunciation feedback only)
  * **Identifiers:** User ID
  * **Usage Data:** Product Interaction (completed lessons, review items, streak)
* **Data Not Linked to You:** Diagnostics (Crash Data)

### Google Play Data Safety Form
* **Does the app collect or share user data?** Yes.
* **Is data encrypted in transit?** Yes (TLS 1.3).
* **Can users request data deletion?** Yes, via in-app button in **Profile → Account & Data → Delete Account**.
* **Data types collected:**
  * Name & Email (Account management)
  * Voice / Sound Recordings (Spoken exercise evaluation)
  * App activity (Progress, lesson mastery)

---

## 4. App Store Review Guidelines Checklist

| Guideline | Requirement | Luma Implementation Status |
| :--- | :--- | :--- |
| **3.1.2** | Auto-Renewable Subscription Terms | In-app legal disclosure, trial terms, auto-renew notice on `PaywallModal.tsx`. |
| **3.1.2** | Restore Purchases Button | Dedicated `↺ Restore previous purchases` button on Paywall and Profile. |
| **3.1.2** | Functional Links to EULA & Privacy | Clickable `Terms of Use (EULA)` and `Privacy Policy` links opening `LegalModal.tsx`. |
| **5.1.1(v)**| In-App Account Deletion | Direct `Delete Account` action in `ProfileEditor` / Account Card with database wipe. |
| **2.1** | Offline Resilience & Crash Resistance | Cached local progress with offline support via `AsyncStorage` and fallback lessons. |
| **2.5.1** | Permission Usage Descriptions | Clear, user-friendly descriptions in `app.json` for Mic, Speech Recognition, and Photos. |

---

## 5. EAS Production Build Commands

Ensure you are logged into your Expo account (`npx eas-cli login`).

### Step 1: Validate Configuration
```bash
npx tsc --noEmit
node tests/subscription.test.mjs
node tests/course-publishing.test.mjs
```

### Step 2: Build for iOS (App Store)
```bash
npx eas build --platform ios --profile production
```
* Generates an `.ipa` archive signed with your Apple Distribution Certificate and Provisioning Profile.
* Automatically submits to App Store Connect TestFlight when configured with `--auto-submit`.

### Step 3: Build for Android (Google Play)
```bash
npx eas build --platform android --profile production
```
* Generates an `.aab` (Android App Bundle) signed with your Google Play Keystore.

---

## 6. Reviewer Demo Notes (For App Store Review)

When submitting for review, provide the following notes in App Store Connect:
```text
DEMO CREDENTIALS:
Username: test-reviewer@luma.app
Password: TestPassword123!

APP DESCRIPTION:
Luma is an English learning application with personalized lessons, speech recognition practice, and an AI conversation teacher.

SUBSCRIPTION TESTING:
A test Apple ID Sandbox account can be used to test the 7-day free trial and annual/monthly subscription on the Paywall screen. To access the paywall, tap the "✦ UPGRADE" pill in the top header or the Pro banner in the Profile tab. Tap "Restore previous purchases" to verify receipt validation.

ACCOUNT DELETION:
In compliance with Guideline 5.1.1(v), account deletion can be tested in Profile -> Account & Data -> "Delete Account".
```
