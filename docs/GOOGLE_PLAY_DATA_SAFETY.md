# Google Play Data Safety & Publication Guide

When submitting **StampUp** to the Google Play Console, follow this exact guide to complete the **Data Safety** questionnaire without getting rejected.

---

## 1. Google Play Data Safety Questionnaire Answers

### Overview Questions
1. **Does your app collect or share any of the required user data types?**
   - **Answer:** **Yes** (Customer phone numbers and owner login credentials).
2. **Is all of the user data collected by your app encrypted in transit?**
   - **Answer:** **Yes** (All communication with Supabase uses TLS 1.3 / HTTPS encryption).
3. **Do you provide a way for users to request that their data be deleted?**
   - **Answer:** **Yes** (Customers can request deletion at the counter, and owners can permanently delete customer data via the in-app "Delete Customer" button).

---

## 2. Data Types Declared

Under **Personal Info**:
- Select: **Phone number**
  - **Collected:** Yes
  - **Shared with third parties:** No
  - **Purpose of collection:** **App functionality** (Loyalty card identification and stamp balance tracking)
  - **Is this data required or optional?** Required for app functionality (to identify the customer's stamp card without requiring password registration).

Under **Account Info / Credentials**:
- Select: **Email address & Password** (for shop owners)
  - **Collected:** Yes
  - **Shared:** No
  - **Purpose:** **Account management**

---

## 3. Privacy Policy URL
- Google Play requires a live, publicly accessible URL for your Privacy Policy.
- Host the [`PRIVACY_POLICY.md`](../PRIVACY_POLICY.md) file on GitHub Pages, your custom domain, or a free host (e.g. `https://your-domain.com/privacy`), and paste that URL into the **App Content → Privacy Policy** section in Google Play Console.

---

## 4. App Permissions
StampUp only requires standard network permissions (`INTERNET`, `ACCESS_NETWORK_STATE`). It does **not** request sensitive device permissions (no location, no camera for cashier, no contacts access, no microphone).
