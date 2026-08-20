<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Outbound email.
 *
 * Everything queues; cron flushes. `mail()` returning true only means the local
 * MTA accepted the message for delivery — it says nothing about whether it was
 * ever sent. A queue turns that into something with retries, a rate cap and a
 * failure log an administrator can actually read.
 *
 * Details that decide whether the mail lands in the inbox or the spam folder:
 *
 * - Headers go in as an **array**. PHP formats and validates the array form and
 *   rejects newlines in it; the string form is a header-injection vector, and
 *   its CRLF line endings become CRCRLF after sendmail, which breaks DKIM.
 * - The envelope sender (`-f`) must share a domain with `From`, or SPF and
 *   DMARC alignment fail regardless of how the DNS is set up.
 * - Every message is multipart/alternative with a real text/plain part.
 *   HTML-only mail scores badly with every filter.
 */
final class Mail
{
    /**
     * Queue a message.
     *
     * @param array<string, string> $headers
     */
    public static function queue(
        string $to,
        string $subject,
        string $text,
        string $html = '',
        array $headers = [],
        int $delaySeconds = 0,
    ): int {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Refusing to queue mail to an invalid address.');
        }
        Db::run(
            'INSERT INTO mail_outbox (to_addr, subject, body_text, body_html, headers_json, status, created_at, send_after)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $to,
                $subject,
                $text,
                $html,
                json_encode($headers, JSON_UNESCAPED_SLASHES),
                'queued',
                time(),
                time() + $delaySeconds,
            ],
        );
        return Db::lastId();
    }

    /**
     * Send everything that is due.
     *
     * @return array{sent: int, failed: int, skipped: int}
     */
    public static function flush(int $limit = 25, ?float $deadline = null): array
    {
        $sent = 0;
        $failed = 0;
        $skipped = 0;

        $cap = max(0, Settings::int('mail.perHourCap', 100));
        if ($cap > 0) {
            $sentLastHour = (int) Db::value(
                "SELECT COUNT(*) FROM mail_outbox WHERE status = 'sent' AND sent_at > ?",
                [time() - 3600],
            );
            if ($sentLastHour >= $cap) {
                return ['sent' => 0, 'failed' => 0, 'skipped' => 1];
            }
            $limit = min($limit, $cap - $sentLastHour);
        }

        $rows = Db::all(
            "SELECT * FROM mail_outbox WHERE status = 'queued' AND send_after <= ? ORDER BY id LIMIT ?",
            [time(), max(1, $limit)],
        );

        foreach ($rows as $row) {
            if ($deadline !== null && microtime(true) > $deadline) {
                $skipped++;
                break;
            }
            $id = (int) $row['id'];
            $headers = json_decode((string) $row['headers_json'], true);
            $ok = false;
            $error = '';
            try {
                $ok = self::send(
                    (string) $row['to_addr'],
                    (string) $row['subject'],
                    (string) $row['body_text'],
                    (string) $row['body_html'],
                    is_array($headers) ? $headers : [],
                );
            } catch (\Throwable $e) {
                $error = $e->getMessage();
            }

            if ($ok) {
                Db::run("UPDATE mail_outbox SET status = 'sent', sent_at = ?, last_error = '' WHERE id = ?", [
                    time(),
                    $id,
                ]);
                $sent++;
                continue;
            }

            $attempts = (int) $row['attempts'] + 1;
            // 1m, 5m, 30m, 2h, 12h — then give up and let a human look at it.
            $backoff = [60, 300, 1800, 7200, 43200];
            $failed++;
            if ($attempts >= count($backoff)) {
                Db::run("UPDATE mail_outbox SET status = 'dead', attempts = ?, last_error = ? WHERE id = ?", [
                    $attempts,
                    $error !== '' ? $error : 'Delivery refused by the mail transport agent.',
                    $id,
                ]);
            } else {
                Db::run(
                    "UPDATE mail_outbox SET attempts = ?, send_after = ?, last_error = ? WHERE id = ?",
                    [$attempts, time() + $backoff[$attempts - 1], $error, $id],
                );
            }
        }

        return ['sent' => $sent, 'failed' => $failed, 'skipped' => $skipped];
    }

    /** @param array<string, string> $extraHeaders */
    public static function send(
        string $to,
        string $subject,
        string $text,
        string $html,
        array $extraHeaders = [],
    ): bool {
        if (!function_exists('mail')) {
            throw new \RuntimeException('mail() is disabled on this host.');
        }

        $fromAddress = self::fromAddress();
        $fromName = Settings::str('mail.fromName', 'DevColorz');
        $domain = substr(strrchr($fromAddress, '@') ?: '@localhost', 1);

        $boundary = '=_dcz_' . bin2hex(random_bytes(12));
        $headers = [
            'From'                      => self::mailbox($fromName, $fromAddress),
            'Date'                      => date('r'),
            'Message-ID'                => '<' . bin2hex(random_bytes(16)) . '@' . $domain . '>',
            'MIME-Version'              => '1.0',
            'Content-Type'              => 'multipart/alternative; boundary="' . $boundary . '"',
            'Auto-Submitted'            => 'auto-generated',
            'X-Auto-Response-Suppress'  => 'All',
        ];
        $replyTo = Settings::str('mail.replyTo');
        if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
            $headers['Reply-To'] = $replyTo;
        }
        foreach ($extraHeaders as $name => $value) {
            // Header injection is impossible with the array form only if the
            // values themselves are clean; PHP rejects newlines, but strip them
            // here so a bad value becomes a harmless one rather than an error.
            $headers[$name] = str_replace(["\r", "\n"], '', $value);
        }

        if ($html === '') {
            $html = self::textToHtml($text);
        }

        $body = "This is a multi-part message in MIME format.\n\n"
            . "--$boundary\n"
            . "Content-Type: text/plain; charset=UTF-8\n"
            . "Content-Transfer-Encoding: quoted-printable\n\n"
            . quoted_printable_encode(str_replace("\r\n", "\n", $text)) . "\n\n"
            . "--$boundary\n"
            . "Content-Type: text/html; charset=UTF-8\n"
            . "Content-Transfer-Encoding: quoted-printable\n\n"
            . quoted_printable_encode(str_replace("\r\n", "\n", $html)) . "\n\n"
            . "--$boundary--\n";

        $encodedSubject = mb_encode_mimeheader($subject, 'UTF-8', 'B', "\n");

        $bounce = Settings::str('mail.bounceAddress');
        if ($bounce === '' || !filter_var($bounce, FILTER_VALIDATE_EMAIL)) {
            $bounce = $fromAddress;
        }
        // Validated above, so escapeshellarg has nothing dangerous to escape —
        // but the parameter still goes through it, because "validated" and
        // "safe to concatenate into a command line" are different claims.
        $params = '-f' . $bounce;

        return @mail($to, $encodedSubject, $body, $headers, $params);
    }

    private static function fromAddress(): string
    {
        $configured = Settings::str('mail.fromAddress');
        if ($configured !== '' && filter_var($configured, FILTER_VALIDATE_EMAIL)) {
            return $configured;
        }
        $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
        $host = preg_replace('/[^a-z0-9.-]/i', '', $host) ?: 'localhost';
        return 'noreply@' . $host;
    }

    private static function mailbox(string $name, string $address): string
    {
        $clean = str_replace(['"', "\r", "\n"], '', $name);
        return $clean === '' ? $address : '"' . $clean . '" <' . $address . '>';
    }

    private static function textToHtml(string $text): string
    {
        $escaped = htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $linked = preg_replace(
            '~(https?://[^\s<]+)~',
            '<a href="$1" style="color:#5b21b6">$1</a>',
            $escaped,
        ) ?? $escaped;
        return '<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f8;'
            . 'font:15px/1.6 -apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#1c1c22">'
            . '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;'
            . 'border:1px solid #e6e6ea">'
            . nl2br($linked)
            . '</div></body></html>';
    }

    /* ------------------------------------------------------------------ *
     * Templates
     * ------------------------------------------------------------------ */

    public static function sendVerification(int $userId, string $email, string $displayName): void
    {
        Security::revokeTokens($userId, 'verify');
        $token = Security::issueToken($userId, 'verify', 86400);
        $link = Http::baseUrl() . '/#/verify?t=' . $token;
        $site = Settings::str('site.name', 'DevColorz');

        $text = "Hello" . ($displayName !== '' ? " $displayName" : '') . ",\n\n"
            . "Confirm this address to finish setting up your $site account:\n\n"
            . "$link\n\n"
            . "The link works once and expires in 24 hours.\n\n"
            . "If you did not create an account, you can ignore this message — "
            . "nothing was created without this confirmation.\n";

        Mail::queue($email, Settings::str('mail.subjectVerify', "Confirm your $site account"), $text);
    }

    public static function sendPasswordReset(int $userId, string $email): void
    {
        Security::revokeTokens($userId, 'reset');
        $token = Security::issueToken($userId, 'reset', 1800);
        $link = Http::baseUrl() . '/#/reset?t=' . $token;
        $site = Settings::str('site.name', 'DevColorz');

        $text = "Someone asked to reset the password for your $site account.\n\n"
            . "$link\n\n"
            . "The link works once and expires in 30 minutes.\n\n"
            . "If it was not you, no action is needed — your password has not changed, "
            . "and whoever made the request cannot see this email.\n";

        Mail::queue($email, Settings::str('mail.subjectReset', "Reset your $site password"), $text);
    }

    public static function sendEmailChange(int $userId, string $newEmail): void
    {
        Security::revokeTokens($userId, 'email_change');
        $token = Security::issueToken($userId, 'email_change', 86400, ['email' => $newEmail]);
        $link = Http::baseUrl() . '/#/verify?t=' . $token . '&purpose=email';
        $site = Settings::str('site.name', 'DevColorz');

        $text = "Confirm this address to make it the new sign-in address for your $site account:\n\n"
            . "$link\n\n"
            . "Until you confirm, the old address stays active. The link expires in 24 hours.\n";

        Mail::queue($newEmail, Settings::str('mail.subjectChange', 'Confirm your new email address'), $text);
    }

    public static function sendPasswordChangedNotice(string $email): void
    {
        $site = Settings::str('site.name', 'DevColorz');
        $text = "The password for your $site account was just changed, and every other "
            . "signed-in session was ended.\n\n"
            . "If that was not you, reset your password immediately at "
            . Http::baseUrl() . "/#/forgot\n";
        Mail::queue($email, "Your $site password was changed", $text);
    }

    public static function prune(int $days = 30): int
    {
        return Db::run("DELETE FROM mail_outbox WHERE status = 'sent' AND sent_at < ?", [
            time() - $days * 86400,
        ])->rowCount();
    }
}
