# Privacy Policy (Draft for Review)

**Last Updated:** October 2, 2026  
**Status:** MVP Draft — Review before production use and Google Play publication.

---

## 1. Introduction

**StampUp** ("we", "our", or "the App") is a digital loyalty stamp card platform designed for small cafés, restaurants, and retail shops. This policy explains what information is collected, how it is used, and how customer privacy is protected.

---

## 2. Information We Collect

We believe in strict data minimization. We only collect the bare minimum information required to operate a digital stamp card:

1. **Shop Owners & Cashiers:**
   - Email address and password (for account creation and authentication via Supabase Auth).
   - Shop name, stamp target requirement, and reward description.

2. **Customers (Loyalty Card Holders):**
   - **Phone number:** Entered by the shop cashier or by the customer when viewing their stamp card.
   - **Stamp & Reward History:** Number of current stamps, total rewards redeemed, and timestamps of visits.

We **do NOT** collect:
- Customer names, home addresses, or emails.
- Credit card, payment, or banking information.
- GPS location data.
- Contacts, photos, microphone audio, or device identifiers.

---

## 3. How We Use the Information

Customer phone numbers and stamp balances are processed solely to:
- Calculate loyalty stamps earned by the customer at the specific shop.
- Determine when the customer qualifies for a free reward.
- Prevent fraudulent rapid-fire stamping via a 60-minute visit rate-limit.

We **never** sell, rent, or share phone numbers with third-party advertisers, data brokers, or marketing networks.

---

## 4. Who Can Access the Data?

- **Shop Owner / Cashier:** The authenticated owner of each shop can only view customers and stamps registered at their own shop. Row Level Security (RLS) is enforced in our database to ensure Shop A's owner cannot view or access Shop B's customers.
- **Customer Web Page:** When a customer scans a QR code and inputs their phone number, the customer web page displays **only** their current stamp count and the shop's reward. It does **not** display or expose other customers' information or phone numbers.

---

## 5. How to Request Data Deletion (Privacy / GDPR / CCPA)

Customers have the absolute right to have their phone numbers and stamp history deleted at any time:
1. **At the Shop:** Customers can ask the shop cashier or owner to delete their record.
2. **Owner Deletion Tool:** The shop app includes a built-in "Delete Customer" feature on the Customers screen. Confirming deletion immediately and permanently erases the customer's phone number, stamp log, and reward history via database cascading delete.

---

## 6. Notice for Google Play Store Publication

Before publishing StampUp on the Google Play Store:
- Google Play requires apps handling personal data (including phone numbers) to complete a **Data Safety section** in the Google Play Console.
- You must declare collection of "Phone number" under Personal Info for the purpose of "App functionality / Account management".
- You must provide a publicly accessible link to this Privacy Policy URL.
- Review Google's latest developer policy requirements prior to production release.
