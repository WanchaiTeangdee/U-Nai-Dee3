Frontend static demo

Files:
- index.html
- styles.css
- app.js

 The page uses Google Font "Poppins" for a modern UI. If you don't see the new font after editing, try clearing browser cache or press Ctrl+F5 to force reload.

Auth API:
- Register: POST /api/register.php { email, password, name }
- Login: POST /api/login.php { email, password } -> returns token saved to localStorage as `authToken`

DB schema for users/tokens: `schema/db_users_tokens.sql` (import into phpMyAdmin)
