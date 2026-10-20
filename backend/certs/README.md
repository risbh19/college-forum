# Supabase database root CA

`supabase-ca.crt` is the **public** Supabase Root 2021 CA certificate, not a private key or account credential. It is included in the backend image so Supabase pooler/direct PostgreSQL connections work with certificate and hostname verification enabled.

- Distribution: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
- DER SHA-256: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`
- Provider guidance: https://supabase.com/docs/guides/platform/ssl-enforcement

Production selects this CA only for Supabase database hostnames; other hosts use the public CA bundle. An explicit `sslrootcert` connection parameter takes precedence for provider-specific certificate changes. `sslmode=verify-full` remains mandatory. Review the source and fingerprint before replacing this certificate; never copy a private key into this directory.
