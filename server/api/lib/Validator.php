<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Input validation.
 *
 * Collects every problem before answering, rather than failing on the first
 * one. A form that reveals its objections one at a time is an interrogation.
 */
final class Validator
{
    /** @var array<string, string> */
    private array $errors = [];

    /** @var array<string, mixed> */
    private array $data;

    /** @param array<string, mixed> $data */
    public function __construct(array $data)
    {
        $this->data = $data;
    }

    /** @param array<string, mixed> $data */
    public static function make(array $data): self
    {
        return new self($data);
    }

    private function raw(string $field): mixed
    {
        return $this->data[$field] ?? null;
    }

    public function string(
        string $field,
        string $label,
        int $min = 0,
        int $max = 255,
        bool $required = true,
    ): string {
        $value = $this->raw($field);
        $text = is_string($value) ? trim($value) : '';
        if ($text === '' && $required) {
            $this->errors[$field] = $label . ' is required.';
            return '';
        }
        if ($text === '') {
            return '';
        }
        $length = mb_strlen($text, 'UTF-8');
        if ($length < $min) {
            $this->errors[$field] = $label . ' must be at least ' . $min . ' characters.';
        } elseif ($length > $max) {
            $this->errors[$field] = $label . ' must be at most ' . $max . ' characters.';
        }
        return $text;
    }

    public function email(string $field = 'email', string $label = 'Email address'): string
    {
        $value = $this->raw($field);
        $text = is_string($value) ? trim($value) : '';
        if ($text === '') {
            $this->errors[$field] = $label . ' is required.';
            return '';
        }
        if (mb_strlen($text, 'UTF-8') > 254 || !filter_var($text, FILTER_VALIDATE_EMAIL)) {
            $this->errors[$field] = 'That does not look like an email address.';
            return '';
        }

        $allowlist = Settings::str('auth.emailDomainAllowlist');
        if ($allowlist !== '') {
            $tail = strrchr($text, '@');
            $domain = $tail === false ? '' : mb_strtolower(substr($tail, 1), 'UTF-8');
            $allowed = array_filter(array_map('trim', explode(',', mb_strtolower($allowlist, 'UTF-8'))));
            if ($allowed !== [] && !in_array($domain, $allowed, true)) {
                $this->errors[$field] = 'Accounts are limited to approved email domains.';
            }
        }
        return $text;
    }

    /**
     * A password.
     *
     * Length is the requirement that actually matters, so it is the one that is
     * enforced. Character-class rules push people toward variations on
     * "Passw0rd!" and are explicitly discouraged by current NIST guidance; the
     * strength meter in the UI advises without blocking.
     */
    public function password(string $field = 'password', string $label = 'Password'): string
    {
        $value = $this->raw($field);
        $text = is_string($value) ? $value : '';
        $min = max(8, Settings::int('auth.minPasswordLength', 12));
        if ($text === '') {
            $this->errors[$field] = $label . ' is required.';
            return '';
        }
        if (strlen($text) > 4096) {
            // An unbounded password is a denial-of-service vector against the
            // hashing function, which is expensive by design.
            $this->errors[$field] = $label . ' is too long.';
            return '';
        }
        if (mb_strlen($text, 'UTF-8') < $min) {
            $this->errors[$field] = $label . ' must be at least ' . $min . ' characters.';
        }
        return $text;
    }

    public function int(string $field, string $label, int $min, int $max, ?int $default = null): int
    {
        $value = $this->raw($field);
        if ($value === null && $default !== null) {
            return $default;
        }
        if (!is_numeric($value)) {
            $this->errors[$field] = $label . ' must be a number.';
            return $default ?? $min;
        }
        $number = (int) $value;
        if ($number < $min || $number > $max) {
            $this->errors[$field] = $label . ' must be between ' . $min . ' and ' . $max . '.';
        }
        return max($min, min($max, $number));
    }

    public function bool(string $field, bool $default = false): bool
    {
        $value = $this->raw($field);
        return is_bool($value) ? $value : $default;
    }

    /** @param list<string> $allowed */
    public function enum(string $field, string $label, array $allowed, string $default): string
    {
        $value = $this->raw($field);
        $text = is_string($value) ? $value : '';
        if ($text === '') {
            return $default;
        }
        if (!in_array($text, $allowed, true)) {
            $this->errors[$field] = $label . ' must be one of: ' . implode(', ', $allowed) . '.';
            return $default;
        }
        return $text;
    }

    /** @return array<string, mixed> */
    public function json(string $field, string $label, int $maxBytes = 262144): array
    {
        $value = $this->raw($field);
        if (!is_array($value)) {
            $this->errors[$field] = $label . ' is missing or malformed.';
            return [];
        }
        $encoded = json_encode($value);
        if (!is_string($encoded) || strlen($encoded) > $maxBytes) {
            $this->errors[$field] = $label . ' is too large.';
            return [];
        }
        return $value;
    }

    public function add(string $field, string $message): void
    {
        $this->errors[$field] = $message;
    }

    public function fails(): bool
    {
        return $this->errors !== [];
    }

    /** @return array<string, string> */
    public function errors(): array
    {
        return $this->errors;
    }

    /** End the request with a 422 if anything failed. */
    public function stopOnError(): void
    {
        if ($this->fails()) {
            Http::validationFailed($this->errors);
        }
    }
}
