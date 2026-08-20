# Installing DevColorz

DevColorz is designed to run on ordinary shared hosting. If you can upload
files over FTP and your host runs PHP 8.2 or newer, you can host it. There is
no build step, no Composer, no Node, no database server to provision — the
whole thing is static files plus PHP and a SQLite file it creates itself.

Ten minutes, start to finish.

---

## What you need

| | |
|---|---|
| **PHP** | 8.2 or newer, with `pdo_sqlite` |
| **SQLite** | 3.24 or newer (3.37+ preferred — it enables stricter typing) |
| **Web server** | Apache with `.htaccess` support, or nginx with the rules in [Other web servers](#other-web-servers) |
| **HTTPS** | Strongly recommended. Session cookies cannot be marked `Secure` without it |
| **Email** | Optional, but account confirmation and password resets need `mail()` to work |

Almost every shared-hosting plan sold in the last decade meets this. The setup
wizard checks all of it before letting you continue, and tells you exactly what
is wrong if something is missing.

---

## Install

### 1. Download and unzip

Grab `devcolorz-1.0.0.zip` from the
[releases page](https://github.com/ZcarecroW/devcolorz/releases) and unzip it.
You get a folder like this:

```
index.html          the app
assets/             its JavaScript and CSS
api/                the PHP backend
cron.php            scheduled maintenance
storage/            runtime state — starts almost empty
.htaccess           routing, security headers, caching
.user.ini           PHP settings
```

### 2. Upload

Upload the **contents** of that folder — not the folder itself — into the
document root of a domain or subdomain. If your host calls it `public_html`,
`httpdocs` or `www`, that is the place.

`index.html` must end up directly in the document root. If you visit your
domain and see a directory listing or a 404, the files are one level too deep.

> **A subfolder works too**, for example `example.com/colors/`. The app uses
> hash-based routing precisely so it does not care where it lives.

### 3. Check permissions

PHP needs to create `storage/` and write `config.php` in the document root.
On most hosts this already works. If the wizard says the document root is not
writable, set the directory to `755` and make sure it is owned by the user PHP
runs as.

### 4. Run the setup wizard

Open your site. You will land on the setup page automatically.

It runs nine checks first — PHP version, SQLite, writability, password hashing,
mail, HTTPS, outbound HTTP, and a real write-ahead-log probe. Four of them
block installation because nothing works without them; the rest are advisory
and explain the trade-off if they fail.

> **HTTPS shows as failed but my site uses HTTPS.** If TLS terminates at a
> proxy or load balancer in front of PHP, `$_SERVER['HTTPS']` is never set and
> the check cannot see it. That is why it does not block.

Then it asks for a **setup code**. Open `storage/setup-code.txt` over FTP or in
your host's file manager, and paste what is inside.

This is not busywork. The gap between uploading the files and creating the
first administrator is the one moment when anybody who knows the URL could
claim your installation — it is a well-documented attack against self-hosted
apps. Reading a file that only exists on your server proves you are the person
who uploaded it. The code expires an hour after it is created; press
**Re-check** for a fresh one.

Fill in the rest, submit, and you are an administrator.

### 5. Save the two tokens

The wizard shows a **cron token** and an **invitation code** exactly once.
Copy both somewhere safe. They are not retrievable afterwards — only
replaceable, from **Admin → System**.

### 6. Set up the cron job

DevColorz needs a scheduled request every five minutes to send queued email,
prune expired rows, rescore the public gallery, checkpoint the database and
take a nightly backup.

In your host's control panel, add a cron job running every 5 minutes:

```
curl -fsS -H "X-Cron-Key: YOUR-CRON-TOKEN" https://example.com/cron.php
```

Sending the token in a header keeps it out of access logs. If your panel only
accepts a plain URL, this works too:

```
https://example.com/cron.php?k=YOUR-CRON-TOKEN
```

A request without a valid token returns `404`, not `403`, so a scanner learns
nothing from probing it.

Without cron the app still works — you simply lose outgoing email, and old
rows accumulate.

---

## After installing

Open **Admin → Settings** and consider:

- **Site name and base URL** — the base URL is used in email links.
- **Mail** — set a `From` address on a domain this server is allowed to send
  as, or your messages will fail SPF and land in spam. Use the test-send button.
- **hCaptcha** — sign up at [hcaptcha.com](https://www.hcaptcha.com), paste the
  site key and secret. Recommended for registration and password reset;
  requiring one on *every* sign-in is usually overkill, because the per-account
  lockout already demands one after a few failures.
- **Registration** — open or closed, and whether an invitation code is needed.
  With invitations on, only people you give the code to can create an account.
- **Rate limits** — the defaults are sensible. Loosen them if you have many
  users behind one office IP.

Then run **Admin → System → Self-test**. It fetches your own database file,
`config.php` and `storage/` over HTTP and confirms the server refuses them.
If anything reports 200, stop and fix your server configuration.

---

## Upgrading

1. Download the new ZIP.
2. Upload it over the top of your installation, **skipping `config.php` and
   `storage/`**. Those hold your secrets and your database.
3. Open the site. Schema migrations run automatically on the first request.

Take a backup first: **Admin → System → Back up now** writes one to
`storage/backups/`, and the cron job makes a nightly one anyway.

---

## Other web servers

The shipped `.htaccess` handles Apache. For **nginx**, the equivalent is:

```nginx
# Never serve runtime state or the config
location ~ ^/(storage|api/lib|api/routes)/ { return 404; }
location = /config.php { return 403; }
location ~ /\.(ht|user\.ini) { return 403; }

# Route the API through the front controller
location /api/ {
    try_files $uri /api/index.php$is_args$args;
}

location ~ \.php$ {
    include fastcgi_params;
    fastcgi_pass unix:/run/php/php8.2-fpm.sock;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
}

# Hashed assets can be cached forever; the entry point cannot
location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
location = /index.html { add_header Cache-Control "no-cache, must-revalidate"; }
```

Add the security headers from `.htaccess` too — the self-test will tell you if
you have missed something that matters.

---

## Troubleshooting

**The site shows a blank page.** Check `storage/php-error.log`. If `storage/`
does not exist, PHP could not create it — that is a permissions problem in the
document root.

**"Not found" on every API call.** The rewrite is not reaching
`api/index.php`. On Apache this usually means `AllowOverride` is `None`; ask
your host to allow `.htaccess`, or add the rules to the server config.

**The setup wizard says it is already installed.** A `config.php` exists. If
this is a fresh install that failed halfway, delete `config.php` **and**
`storage/.installed`, then reload.

**Email never arrives.** Check **Admin → System → Outbox** for the failure.
The most common cause is a `From` address on a domain this server may not send
as. Many shared hosts also require the address to be a real mailbox.

**"Database is locked".** Rare, and normally means the host's filesystem does
not support write-ahead logging — usually an NFS-mounted home directory. The
app detects this at install and falls back automatically; **Admin → System**
shows which mode is in use.

---

## Uninstalling

Delete the files. Everything DevColorz created lives in the document root:
`config.php`, `storage/`, and the app itself. There is nothing in a system
database, no cron entries but the one you added, and nothing outside that
folder.
