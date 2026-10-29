# Dedicated live admin login

This is the user-authorized operator exception to college Google login. Students still sign in through verified college Google accounts. There is no public password registration.

1. From the `backend` folder on Windows, run `.venv/Scripts/python.exe -m app.admin_credentials`. The generator creates `.local/admin-credentials.txt` in the project root, never overwrites an existing file, and prints no credentials. It uses no environment files, network, database, or identity pepper.
2. Open that private sheet locally, save the username/password in your password manager, and copy the listed server settings into Vercel and Render. None belong in `NEXT_PUBLIC_` variables. Only the salted password hash goes to Render; the plaintext password stays private.
3. Preserve existing `ADMIN_ANON_IDS` entries when appending the new synthetic ID. Use the same generated `ADMIN_LOGIN_ACCOUNT_ID` on both services. Keep student identity keys unchanged. Production web/backend URLs must use HTTPS; the live admin provider stays disabled in development/local demo mode.
4. Deploy the matching frontend/backend and the existing portal migration `0003_admin_accounts` after reviewing/backing up its target. The first successful sign-in creates the operator account. Open your live site's `/admin/login` and use the generated username/password. This file and code alone do not activate credentials on an already deployed website.
5. Verify incorrect credentials fail, a student cannot call admin APIs, the operator can open `/admin`, and login attempts are throttled. These controls use [NextAuth v4 Credentials](https://next-auth.js.org/providers/credentials) and Python's [scrypt implementation](https://docs.python.org/3/library/hashlib.html#hashlib.scrypt).

To change a password, generate a replacement sheet after moving the old sheet privately. Apply the new `ADMIN_LOGIN_PASSWORD_HASH` and `ADMIN_LOGIN_VERSION`, while retaining the **original** account ID and username in both services; discard the replacement sheet's new ID. Redeploy both services. Changing the version revokes previous operator sessions. Do not change `ANON_PEPPER` or `NEXTAUTH_SECRET` for this operation.

To disable the account, set `ADMIN_LOGIN_ENABLED=0` on Vercel and redeploy. Clear all three backend `ADMIN_LOGIN_*` values and remove its dedicated ID from `ADMIN_ANON_IDS` on Render, then redeploy; keep other admins intact. Removing only the allowlist entry while leaving the backend login settings populated deliberately fails configuration validation.

The credential sheet contains sensitive data and must remain ignored. Do not upload `.local/`, paste the password into chat, or commit the sheet. Hosting account setup and these private environment changes must be completed before the credentials work live.
